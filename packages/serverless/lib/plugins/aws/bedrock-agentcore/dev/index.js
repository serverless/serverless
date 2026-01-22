'use strict'

import path from 'path'
import { setTimeout as asyncSetTimeout } from 'node:timers/promises'
import { createInterface } from 'readline'
import { randomUUID } from 'crypto'
import chokidar from 'chokidar'
import chalk from 'chalk'
import { DockerClient, log, progress } from '@serverless/util'
import {
  GetRoleCommand,
  IAMClient,
  UpdateAssumeRolePolicyCommand,
} from '@aws-sdk/client-iam'
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts'
import { DockerBuilder } from '../docker/builder.js'
import { AgentCoreCodeMode } from './code-mode.js'
import fileExists from '../../../../utils/fs/file-exists.js'

const logger = log.get('agentcore:dev-mode')
const devProgress = progress.get('main')

/**
 * AgentCore Dev Mode - Local development for AgentCore runtimes
 *
 * Provides:
 * - Docker container execution OR direct Python execution
 * - AWS credentials injection via STS AssumeRole
 * - File watching with automatic rebuild/restart
 */
export class AgentCoreDevMode {
  #projectPath
  #agentName
  #agentConfig
  #region
  #roleArn
  #mode // 'docker' or 'code'
  #docker
  #dockerBuilder
  #codeMode
  #container
  #watcher
  #isRebuilding
  #pendingRebuild
  #isShuttingDown
  #port
  #iamClient
  #stsClient
  // Chat-related fields
  #sessionId
  #readline
  #isInvoking

  /**
   * Creates a new AgentCoreDevMode instance
   * @param {Object} options - Configuration options
   * @param {Object} options.serverless - Serverless instance
   * @param {string} options.projectPath - Path to the project directory
   * @param {string} options.agentName - Name of the agent
   * @param {Object} options.agentConfig - Agent configuration
   * @param {string} options.region - AWS region
   * @param {string} options.roleArn - IAM role ARN to assume for credentials
   * @param {number} [options.port=8080] - Port to expose the container on
   */
  constructor({
    serverless,
    projectPath,
    agentName,
    agentConfig,
    region,
    roleArn,
    port = 8080,
  }) {
    this.#projectPath = projectPath
    this.#agentName = agentName
    this.#agentConfig = agentConfig
    this.#region = region
    this.#roleArn = roleArn
    this.#port = port

    // Mode detection will happen in start()
    this.#mode = null
    this.#docker = new DockerClient()
    this.#dockerBuilder = new DockerBuilder(serverless, log, progress)
    this.#codeMode = null
    this.#container = null
    this.#watcher = null
    this.#isRebuilding = false
    this.#pendingRebuild = false
    this.#isShuttingDown = false

    // Initialize AWS clients
    this.#iamClient = new IAMClient({ region })
    this.#stsClient = new STSClient({ region })

    // Chat state
    this.#sessionId = randomUUID()
    this.#readline = null
    this.#isInvoking = false
  }

  /**
   * Detect which mode to use (Docker vs Code)
   * @private
   */
  async #detectMode() {
    const artifact = this.#agentConfig.artifact

    // Priority 1: Explicit docker configuration
    if (artifact?.docker) {
      return 'docker'
    }

    // Priority 2: entryPoint means code mode
    if (
      artifact?.entryPoint &&
      !artifact?.containerImage &&
      !artifact?.s3?.bucket
    ) {
      return 'code'
    }

    // Priority 3: Look for Dockerfile in project root (implicit Docker)
    const dockerfilePath = path.join(this.#projectPath, 'Dockerfile')
    if (await fileExists(dockerfilePath)) {
      return 'docker'
    }

    // No artifact configuration found
    throw new Error(
      `No artifact configuration found for agent '${this.#agentName}'. ` +
        `Please specify artifact.docker or artifact.entryPoint in serverless.yml`,
    )
  }

  /**
   * Start dev mode
   */
  async start() {
    logger.debug(`Starting dev mode for agent: ${this.#agentName}`)

    try {
      // Detect mode
      this.#mode = await this.#detectMode()
      logger.debug(`Using ${this.#mode} mode`)

      // Get caller identity for trust policy
      devProgress.notice('Configuring IAM trust policy...')
      const callerIdentity = await this.#getCallerIdentity()
      logger.debug(`Local user ARN: ${callerIdentity.Arn}`)

      // Ensure trust policy allows local user to assume role
      await this.#ensureLocalDevTrustPolicy(callerIdentity.Arn)
      devProgress.remove()

      // Get temporary credentials
      devProgress.notice('Obtaining AWS credentials...')
      const credentials = await this.#getTemporaryCredentials()
      devProgress.remove()

      // Start the appropriate mode
      if (this.#mode === 'docker') {
        await this.#startDockerMode(credentials)
      } else {
        await this.#startCodeMode(credentials)
      }

      // Start file watcher
      await this.#startWatcher(credentials)

      // Stream logs
      this.#streamLogs()

      logger.blankLine()
      logger.notice(`Dev mode running on http://localhost:${this.#port}`)
      logger.blankLine()
      logger.aside(`Session ID: ${this.#sessionId}`)
      logger.aside('Type your message and press Enter to chat with the agent.')
      logger.aside('Press Ctrl+C to stop.')
      logger.blankLine()

      // Start interactive chat
      await this.#startChat()
    } catch (error) {
      devProgress.remove()
      throw error
    }
  }

  /**
   * Stop dev mode
   */
  async stop() {
    // Guard against being called twice
    if (
      this.#container === null &&
      this.#codeMode === null &&
      this.#watcher === null &&
      this.#readline === null
    ) {
      return // Already stopped
    }

    this.#isShuttingDown = true

    logger.debug(`Stopping dev mode for agent: ${this.#agentName}`)

    // Close readline
    if (this.#readline) {
      this.#readline.close()
      this.#readline = null
    }

    // Stop watcher
    if (this.#watcher) {
      await this.#watcher.close()
      this.#watcher = null
    }

    // Stop based on mode
    if (this.#mode === 'docker') {
      // Stop Docker container
      if (this.#container) {
        try {
          const info = await this.#container.inspect()
          if (info.State.Running) {
            await this.#container.kill()
          }
          await this.#container.remove()
        } catch (error) {
          logger.debug(`Error stopping container: ${error.message}`)
        }
        this.#container = null
      }
    } else if (this.#mode === 'code') {
      // Stop Python process
      if (this.#codeMode) {
        await this.#codeMode.stop()
        this.#codeMode = null
      }
    }

    logger.blankLine()
  }

  /**
   * Get caller identity from STS
   * @private
   */
  async #getCallerIdentity() {
    const response = await this.#stsClient.send(
      new GetCallerIdentityCommand({}),
    )
    return response
  }

  /**
   * Ensure the IAM role's trust policy allows the local user to assume it
   * @private
   */
  async #ensureLocalDevTrustPolicy(localUserArn) {
    // Extract role name from ARN
    const roleArnParts = this.#roleArn.split('/')
    const roleName = roleArnParts[roleArnParts.length - 1]

    logger.debug(`Checking trust policy for role: ${roleName}`)

    // Get current trust policy
    const getRoleResponse = await this.#iamClient.send(
      new GetRoleCommand({ RoleName: roleName }),
    )

    if (!getRoleResponse.Role?.AssumeRolePolicyDocument) {
      throw new Error(`Could not get trust policy for role: ${roleName}`)
    }

    const trustPolicy = JSON.parse(
      decodeURIComponent(getRoleResponse.Role.AssumeRolePolicyDocument),
    )

    // Check if local dev policy statement exists
    const devPolicySid = 'ServerlessAgentCoreLocalDevPolicy'
    let devPolicyIndex = trustPolicy.Statement.findIndex(
      (stmt) => stmt.Sid === devPolicySid,
    )

    if (devPolicyIndex === -1) {
      // Add new dev policy statement
      trustPolicy.Statement.push({
        Sid: devPolicySid,
        Effect: 'Allow',
        Principal: {
          AWS: [localUserArn],
        },
        Action: 'sts:AssumeRole',
      })

      await this.#iamClient.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: roleName,
          PolicyDocument: JSON.stringify(trustPolicy),
        }),
      )

      // Wait for policy to propagate
      logger.debug('Waiting for trust policy to propagate...')
      await asyncSetTimeout(5000)
    } else {
      // Check if local user ARN is already in the policy
      const devPolicy = trustPolicy.Statement[devPolicyIndex]
      const principals = Array.isArray(devPolicy.Principal?.AWS)
        ? devPolicy.Principal.AWS
        : [devPolicy.Principal?.AWS].filter(Boolean)

      if (!principals.includes(localUserArn)) {
        // Add local user to existing policy
        devPolicy.Principal.AWS = [...principals, localUserArn]

        await this.#iamClient.send(
          new UpdateAssumeRolePolicyCommand({
            RoleName: roleName,
            PolicyDocument: JSON.stringify(trustPolicy),
          }),
        )

        // Wait for policy to propagate
        logger.debug('Waiting for trust policy to propagate...')
        await asyncSetTimeout(5000)
      }
    }
  }

  /**
   * Get temporary credentials by assuming the role
   * @private
   */
  async #getTemporaryCredentials() {
    let attemptCount = 0
    let lastError

    while (attemptCount < 10) {
      try {
        const response = await this.#stsClient.send(
          new AssumeRoleCommand({
            RoleArn: this.#roleArn,
            RoleSessionName: `agentcore-dev-mode-${Date.now()}`,
          }),
        )
        // Debug: log credential expiration
        const expiration = new Date(response.Credentials.Expiration)
        const now = new Date()
        const minutesUntilExpiry = Math.round((expiration - now) / 60000)
        logger.debug(
          `Got credentials expiring at ${expiration.toISOString()} (in ${minutesUntilExpiry} minutes)`,
        )
        return response.Credentials
      } catch (error) {
        lastError = error
        attemptCount++
        if (attemptCount < 10) {
          const sleepTime = 5000 * Math.pow(2, attemptCount - 1)
          logger.debug(
            `Retry ${attemptCount}/10 getting credentials in ${sleepTime}ms...`,
          )
          await asyncSetTimeout(Math.min(sleepTime, 30000))
        }
      }
    }

    throw lastError
  }

  /**
   * Start Docker mode
   * @private
   */
  async #startDockerMode(credentials) {
    // Build the Docker image (long-running, use progress spinner)
    devProgress.notice('Building Docker image...')
    await this.#buildImage()
    devProgress.remove()

    // Start the container with credentials
    devProgress.notice('Starting container...')
    await this.#startContainer(credentials)
    devProgress.remove()
  }

  /**
   * Start Code mode
   * @private
   */
  async #startCodeMode(credentials) {
    // Initialize code mode
    this.#codeMode = new AgentCoreCodeMode({
      projectPath: this.#projectPath,
      agentName: this.#agentName,
      agentConfig: this.#agentConfig,
      region: this.#region,
      port: this.#port,
    })

    // Start Python process
    devProgress.notice('Starting Python process...')
    await this.#codeMode.start(credentials)
    devProgress.remove()
  }

  /**
   * Build the Docker image using shared DockerBuilder logic
   * @private
   */
  async #buildImage() {
    const imageUri = this.#getImageUri()

    // Create imageConfig that matches the artifact.docker format
    const imageConfig = {
      path: this.#agentConfig.artifact?.docker?.path || '.',
      platform: this.#agentConfig.artifact?.docker?.platform,
      file: this.#agentConfig.artifact?.docker?.file,
      buildArgs: this.#agentConfig.artifact?.docker?.buildArgs,
      buildOptions: this.#agentConfig.artifact?.docker?.buildOptions,
      cacheFrom: this.#agentConfig.artifact?.docker?.cacheFrom,
    }

    logger.debug(`Building image: ${imageUri}`)
    logger.debug(`Context path: ${imageConfig.path}`)

    // Use DockerBuilder for consistent build logic with deployment
    await this.#dockerBuilder.buildImage(
      imageUri,
      imageConfig,
      this.#projectPath,
    )
  }

  /**
   * Start the container with AWS credentials
   * @private
   */
  async #startContainer(credentials) {
    const imageUri = this.#getImageUri()
    // Docker container names should be lowercase
    const containerName = `agentcore-dev-${this.#agentName}`.toLowerCase()

    // Remove existing container if it exists
    await this.#docker.removeContainer({ containerName })

    // Create environment variables
    const env = {
      AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
      AWS_SESSION_TOKEN: credentials.SessionToken,
      AWS_REGION: this.#region,
      AWS_DEFAULT_REGION: this.#region,
      // AgentCore specific
      AGENTCORE_DEV_MODE: 'true',
      // Disable Python output buffering for immediate log output
      PYTHONUNBUFFERED: '1',
      // User-defined environment variables
      ...(this.#agentConfig.environment || {}),
    }

    this.#container = await this.#docker.createContainer({
      imageUri,
      name: containerName,
      exposedPorts: {
        '8080/tcp': {},
      },
      env,
      hostConfig: {
        PortBindings: {
          '8080/tcp': [{ HostPort: String(this.#port) }],
        },
      },
      labels: {
        'com.serverless.agentcore.dev-mode': 'true',
        'com.serverless.agentcore.agent': this.#agentName,
      },
    })

    await this.#container.start()

    // Wait for container to be ready
    await asyncSetTimeout(2000)
  }

  /**
   * Stream logs from container or process
   * @private
   */
  async #streamLogs() {
    if (this.#mode === 'docker') {
      await this.#streamContainerLogs()
    } else if (this.#mode === 'code') {
      this.#streamProcessLogs()
    }
  }

  /**
   * Stream container logs (Docker mode)
   * @private
   */
  async #streamContainerLogs() {
    try {
      const stream = await this.#container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      })

      stream.on('data', (chunk) => {
        // Strip Docker multiplexing headers (8 bytes per frame)
        // Format: [STREAM_TYPE(1)][0][0][0][SIZE(4)][PAYLOAD]
        const text = this.#stripDockerHeaders(chunk)
        if (text.trim()) {
          this.#displayLog(text)
        }
      })
    } catch (error) {
      logger.debug(`Error streaming logs: ${error.message}`)
    }
  }

  /**
   * Stream process logs (Code mode)
   * @private
   */
  #streamProcessLogs() {
    const process = this.#codeMode.getProcess()

    process.stdout.on('data', (data) => {
      this.#displayLog(data.toString())
    })

    process.stderr.on('data', (data) => {
      this.#displayLog(data.toString())
    })
  }

  /**
   * Strip Docker stream multiplexing headers from log output
   * @private
   */
  #stripDockerHeaders(buffer) {
    const result = []
    let offset = 0

    while (offset < buffer.length) {
      // Check if we have at least 8 bytes for the header
      if (offset + 8 > buffer.length) {
        // Not enough bytes for header, treat rest as raw data
        result.push(buffer.slice(offset).toString('utf8'))
        break
      }

      // Read the stream type (1 byte) and size (4 bytes, big endian)
      const streamType = buffer[offset]
      // Skip bytes 1-3 (padding)
      const size = buffer.readUInt32BE(offset + 4)

      // Validate stream type (0=stdin, 1=stdout, 2=stderr)
      if (streamType > 2 || size > buffer.length - offset - 8) {
        // Invalid header, treat as raw data
        result.push(buffer.slice(offset).toString('utf8'))
        break
      }

      // Extract the payload
      const payload = buffer.slice(offset + 8, offset + 8 + size)
      result.push(payload.toString('utf8'))

      offset += 8 + size
    }

    return result.join('')
  }

  /**
   * Display a log message with formatting
   * @private
   */
  #displayLog(text) {
    // Don't display logs during shutdown
    if (this.#isShuttingDown) {
      return
    }

    // Check if this looks like a Python dict repr (raw agent output)
    // Format: {'data': 'text', 'delta': {...}, 'agent': <...>, ...}
    if (
      text.includes("'data':") ||
      text.includes('"data":') ||
      text.includes('<strands.') ||
      text.includes('UUID(')
    ) {
      // This is raw agent event output, always suppress it
      return
    }

    // Try to parse as JSON to identify structured logs
    // Only consider it a JSON log if it's a structured object (starts with {)
    // This avoids treating raw numbers/strings as valid JSON logs
    let isJsonLog = false
    if (text.trim().startsWith('{')) {
      try {
        JSON.parse(text)
        isJsonLog = true
      } catch {
        // Not valid JSON
      }
    }

    // Display structured JSON logs (like server status messages)
    if (isJsonLog) {
      logger.aside(text)
    }
    // Suppress all non-JSON output to avoid displaying raw event data fragments
  }

  /**
   * Start file watcher for hot reload
   * @private
   */
  async #startWatcher(credentials) {
    // Get watch path based on mode
    let watchPath
    let watchPatterns = null

    if (this.#mode === 'docker') {
      watchPath = this.#getDockerfilePath()
    } else if (this.#mode === 'code') {
      watchPath = this.#codeMode.getWatchPath()
      watchPatterns = this.#codeMode.getWatchPatterns()
    }

    logger.debug(`Watching for changes in: ${watchPath}`)

    const watchOptions = {
      ignored: (filePath, stats) => {
        // Common exclusions
        const commonExclusions = [
          '/node_modules/',
          '/.git/',
          '/__pycache__/',
          '/.venv/',
          '/venv/',
          '/.pytest_cache/',
          '/.mypy_cache/',
          '/coverage/',
          '/.serverless/',
        ]

        for (const exclusion of commonExclusions) {
          if (filePath.includes(exclusion)) {
            return true
          }
        }

        // Code mode: only watch .py files
        if (this.#mode === 'code' && stats?.isFile()) {
          if (!filePath.endsWith('.py')) {
            return true
          }
        }

        // Ignore test files
        if (
          stats?.isFile() &&
          (filePath.endsWith('.test.js') ||
            filePath.endsWith('.spec.js') ||
            filePath.endsWith('_test.py') ||
            filePath.endsWith('.test.py'))
        ) {
          return true
        }

        return false
      },
      ignoreInitial: true,
      followSymlinks: false,
      usePolling: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    }

    this.#watcher = chokidar.watch(watchPath, watchOptions)

    this.#watcher.on('all', async (event, filePath) => {
      if (this.#isShuttingDown) return

      const relativePath = path.relative(watchPath, filePath)
      logger.notice(`Detected ${event} in ${relativePath}. Rebuilding...`)

      await this.#performRebuild(credentials)
    })
  }

  /**
   * Perform rebuild and restart
   * @private
   */
  async #performRebuild(credentials) {
    // If already rebuilding, queue this rebuild
    if (this.#isRebuilding) {
      this.#pendingRebuild = true
      return
    }

    this.#isRebuilding = true

    // Pause readline during rebuild
    if (this.#readline) {
      this.#readline.pause()
    }

    try {
      // Small delay to let filesystem settle
      await asyncSetTimeout(100)

      // Refresh credentials if they're about to expire
      const refreshedCreds = await this.#refreshCredentialsIfNeeded(credentials)

      // Rebuild based on mode
      if (this.#mode === 'docker') {
        // Rebuild image (long-running, use progress spinner)
        devProgress.notice('Rebuilding Docker image...')
        await this.#buildImage()
        devProgress.remove()

        // Stop current container
        if (this.#container) {
          try {
            const info = await this.#container.inspect()
            if (info.State.Running) {
              await this.#container.kill()
            }
            await this.#container.remove()
          } catch (error) {
            logger.debug(`Error stopping container: ${error.message}`)
          }
        }

        // Start new container
        await this.#startContainer(refreshedCreds)

        // Restart container log streaming
        this.#streamContainerLogs()
      } else if (this.#mode === 'code') {
        // Restart Python process
        devProgress.notice('Restarting Python process...')
        await this.#codeMode.stop()
        await this.#codeMode.start(refreshedCreds)
        devProgress.remove()

        // Restart process log streaming
        this.#streamProcessLogs()
      }

      // Reset session for new conversation
      this.#sessionId = randomUUID()

      logger.blankLine()
      logger.notice(
        `Rebuild complete. Running on http://localhost:${this.#port}`,
      )
      logger.blankLine()
    } catch (error) {
      devProgress.remove()
      logger.error(`Rebuild failed: ${error.message}`)
    } finally {
      this.#isRebuilding = false

      // Resume readline and redisplay prompt (only if not shutting down)
      if (this.#readline && !this.#isInvoking && !this.#isShuttingDown) {
        // Small delay to let process stabilize
        await asyncSetTimeout(500)
        this.#readline.resume()
        this.#readline.prompt()
      }

      // Process pending rebuild if any (only if not shutting down)
      if (this.#pendingRebuild && !this.#isShuttingDown) {
        this.#pendingRebuild = false
        await this.#performRebuild(credentials)
      }
    }
  }

  /**
   * Refresh credentials if they're about to expire
   * @private
   */
  async #refreshCredentialsIfNeeded(credentials) {
    // Check if credentials expire in less than 10 minutes
    const expirationTime = new Date(credentials.Expiration).getTime()
    const now = Date.now()
    const tenMinutes = 10 * 60 * 1000

    if (expirationTime - now < tenMinutes) {
      logger.debug('Refreshing credentials...')
      return await this.#getTemporaryCredentials()
    }

    return credentials
  }

  /**
   * Start interactive chat
   * @private
   */
  async #startChat() {
    return new Promise((resolve) => {
      this.#readline = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      })

      // Set the prompt text
      this.#readline.setPrompt(chalk.green('You: '))

      // Handle line input
      this.#readline.on('line', async (input) => {
        // Immediately return if shutting down or rebuilding
        if (this.#isShuttingDown || this.#isRebuilding) return

        const trimmed = input.trim()
        if (trimmed) {
          await this.#invokeAgent(trimmed)
        } else {
          // Empty input, just show prompt again
          if (!this.#isShuttingDown) {
            this.#readline.prompt()
          }
        }
      })

      // Handle Ctrl+C and other signals
      let shutdownInProgress = false

      const handleShutdown = async () => {
        // Prevent multiple shutdown calls
        if (shutdownInProgress) return
        shutdownInProgress = true

        // Set flag to prevent line events from processing
        this.#isShuttingDown = true

        // Call stop() which will handle cleanup
        await this.stop()
        resolve()
      }

      // Use 'close' event for when readline is closed
      this.#readline.on('close', handleShutdown)

      // Handle process signals
      const signalHandler = () => {
        // Set flag immediately to stop line event processing
        this.#isShuttingDown = true

        // Close readline (this will trigger the 'close' event)
        if (this.#readline && !shutdownInProgress) {
          this.#readline.close()
        }
      }

      process.on('SIGINT', signalHandler)
      process.on('SIGTERM', signalHandler)

      // Show initial prompt
      this.#readline.prompt()
    })
  }

  /**
   * Invoke the agent with a message
   * @private
   */
  async #invokeAgent(message) {
    // Don't invoke if shutting down
    if (this.#isShuttingDown) {
      return
    }

    if (this.#isInvoking) {
      // Pause briefly to show warning without display issues
      if (this.#readline) {
        this.#readline.pause()
      }
      logger.warning('Please wait for the current request to complete.')
      if (this.#readline) {
        this.#readline.resume()
        this.#readline.prompt()
      }
      return
    }

    this.#isInvoking = true

    // Pause readline to prevent display issues during output
    if (this.#readline) {
      this.#readline.pause()
    }

    try {
      const url = `http://localhost:${this.#port}/invocations`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': this.#sessionId,
        },
        body: JSON.stringify({ prompt: message }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.blankLine()
        logger.error(`Agent Error (${response.status}): ${errorText}`)
        logger.blankLine()
        return
      }

      const contentType = response.headers.get('content-type') || ''

      logger.blankLine()
      logger.notice(chalk.blue('Agent:'))

      if (contentType.includes('text/event-stream')) {
        // Handle SSE streaming response
        await this.#handleStreamingResponse(response)
      } else {
        // Handle JSON response
        await this.#handleJsonResponse(response)
      }

      logger.blankLine()
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.blankLine()
        logger.error(
          'Error: Container is not responding. It may be restarting.',
        )
        logger.blankLine()
      } else {
        logger.blankLine()
        logger.error(`Error: ${error.message}`)
        logger.blankLine()
      }
    } finally {
      this.#isInvoking = false

      // Resume readline and redisplay prompt (only if not shutting down)
      if (this.#readline && !this.#isShuttingDown) {
        this.#readline.resume()
        this.#readline.prompt()
      }
    }
  }

  /**
   * Handle SSE streaming response
   * @private
   */
  async #handleStreamingResponse(response) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process the buffer - handle both SSE format and raw Python repr
        // SSE format: "data: {...}\n\ndata: {...}\n\n"
        // Raw format: "{'data': '...',...}{'data': '...',...}"

        // First try SSE format (lines starting with data:)
        const lines = buffer.split('\n')
        let processedSse = false

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]
          if (line.startsWith('data:')) {
            processedSse = true
            const data = line.slice(5).trim()
            if (data && data !== '[DONE]') {
              this.#processStreamData(data)
            }
          }
        }

        if (processedSse) {
          // Keep only the last incomplete line
          buffer = lines[lines.length - 1]
        } else {
          // Not SSE format - try to extract from raw Python repr
          // Look for complete Python dict patterns: {...}
          const extracted = this.#extractAllTextFromPythonRepr(buffer)
          if (extracted.text) {
            process.stdout.write(extracted.text)
          }
          // Keep any remaining unprocessed content
          buffer = extracted.remaining
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        const extracted = this.#extractAllTextFromPythonRepr(buffer)
        if (extracted.text) {
          process.stdout.write(extracted.text)
        }
      }
    } finally {
      reader.releaseLock()
    }

    process.stdout.write('\n')
  }

  /**
   * Process a single data chunk (JSON or Python repr)
   * @private
   */
  #processStreamData(data) {
    try {
      const parsed = JSON.parse(data)

      // Check for error events from the agent
      if (parsed.error) {
        logger.blankLine()
        logger.error(`Agent Error: ${JSON.stringify(parsed)}`)
        if (parsed.message) {
          logger.error(parsed.message)
        }
        return
      }

      const text = this.#extractTextFromEvent(parsed)
      if (text) {
        process.stdout.write(text)
      }
    } catch {
      // Not JSON, try Python repr
      const text = this.#extractTextFromPythonRepr(data)
      if (text) {
        process.stdout.write(text)
      }
    }
  }

  /**
   * Extract all text from concatenated Python repr dicts
   * @private
   */
  #extractAllTextFromPythonRepr(buffer) {
    let text = ''
    let remaining = buffer

    // Match all occurrences of 'data': 'value' or "data": "value"
    const regex = /['"]data['"]\s*:\s*['"]([^'"]*)['"]/g
    let match

    while ((match = regex.exec(buffer)) !== null) {
      text += match[1]
    }

    // If we extracted any text, the buffer is consumed
    if (text) {
      remaining = ''
    }

    return { text, remaining }
  }

  /**
   * Handle JSON response
   * @private
   */
  async #handleJsonResponse(response) {
    const data = await response.json()

    // Extract response text from various possible formats
    if (typeof data === 'string') {
      process.stdout.write(data + '\n')
    } else if (data.result) {
      const text =
        typeof data.result === 'string'
          ? data.result
          : JSON.stringify(data.result)
      process.stdout.write(text + '\n')
    } else if (data.response) {
      const text =
        typeof data.response === 'string'
          ? data.response
          : JSON.stringify(data.response)
      process.stdout.write(text + '\n')
    } else if (data.message) {
      const text =
        typeof data.message === 'string'
          ? data.message
          : JSON.stringify(data.message)
      process.stdout.write(text + '\n')
    } else if (data.error) {
      logger.error(`Error: ${data.error}`)
      if (data.traceback) {
        logger.aside(data.traceback)
      }
    } else {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    }
  }

  /**
   * Extract text content from an SSE event
   * @private
   */
  #extractTextFromEvent(event) {
    // If event is a string, it might be Python repr wrapped in JSON
    if (typeof event === 'string') {
      // Check if it's Python repr format - skip it (return null to suppress)
      if (event.includes("'data':") || event.includes('<strands.')) {
        return null
      }
      return event
    }

    // BedrockAgentCore format: {"event": {"contentBlockDelta": {"delta": {"text": "Hello"}}}}
    if (event.event?.contentBlockDelta?.delta?.text !== undefined) {
      return event.event.contentBlockDelta.delta.text
    }

    // Skip non-content events (init, start, messageStart, etc.)
    if (event.init_event_loop || event.start || event.start_event_loop) {
      return null
    }
    if (
      event.event?.messageStart ||
      event.event?.messageStop ||
      event.event?.contentBlockStop
    ) {
      return null
    }

    // Strands format: {'data': 'text', 'delta': {'text': 'text'}, ...}
    if (event.data !== undefined && event.data !== null) {
      return String(event.data)
    }
    if (event.text) {
      return event.text
    }
    if (event.content) {
      if (typeof event.content === 'string') {
        return event.content
      }
      if (Array.isArray(event.content)) {
        return event.content
          .map((c) => (typeof c === 'string' ? c : c.text || ''))
          .join('')
      }
    }
    if (event.delta?.text) {
      return event.delta.text
    }
    if (event.choices?.[0]?.delta?.content) {
      return event.choices[0].delta.content
    }
    return null
  }

  /**
   * Extract text from Python repr format (as a fallback)
   * Input: "{'data': 'Hello', 'delta': {'text': 'Hello'}, ...}"
   * Output: "Hello"
   * @private
   */
  #extractTextFromPythonRepr(pythonRepr) {
    try {
      // Simple regex to extract 'data': 'value'
      // Matches: 'data': 'Hello' or "data": "Hello"
      const simpleDataMatch = pythonRepr.match(
        /['"]data['"]\s*:\s*['"]([^'"]+)['"]/,
      )
      if (simpleDataMatch && simpleDataMatch[1]) {
        return simpleDataMatch[1]
      }

      // Try delta.text as fallback
      const simpleDeltaMatch = pythonRepr.match(
        /['"]text['"]\s*:\s*['"]([^'"]+)['"]/,
      )
      if (simpleDeltaMatch && simpleDeltaMatch[1]) {
        return simpleDeltaMatch[1]
      }
    } catch (error) {
      // Extraction failed, return null
    }

    return null
  }

  /**
   * Get the local image URI
   * @private
   */
  #getImageUri() {
    // Docker requires repository names to be lowercase
    return `agentcore-${this.#agentName}:local`.toLowerCase()
  }

  /**
   * Get the path to the Dockerfile/source directory
   * @private
   */
  #getDockerfilePath() {
    const artifact = this.#agentConfig.artifact
    if (artifact?.docker?.path) {
      return path.resolve(this.#projectPath, artifact.docker.path)
    }
    // Default to project root
    return this.#projectPath
  }
}
