'use strict'

import path from 'path'
import os from 'os'
import fs from 'fs'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { setTimeout as asyncSetTimeout } from 'node:timers/promises'
import { log, ServerlessError } from '@serverless/util'
import { SUPPORTED_AGENT_RUNTIMES } from '../validators/schema.js'

const execFileP = promisify(execFile)
const logger = log.get('agentcore:code-mode')

/**
 * AgentCore Code Mode - Runs Python agent directly without Docker
 *
 * Provides:
 * - Direct Python process execution
 * - Virtual environment support
 * - Fast startup and iteration
 * - AWS credentials injection
 */
export class AgentCoreCodeMode {
  #projectPath
  #agentConfig
  #region
  #port
  #process
  #isShuttingDown

  constructor({ projectPath, agentName, agentConfig, region, port }) {
    this.#projectPath = projectPath
    this.#agentConfig = agentConfig
    this.#region = region
    this.#port = port
    this.#process = null
    this.#isShuttingDown = false
  }

  /**
   * Start the Python process
   */
  async start(credentials) {
    const handler = this.#agentConfig.handler
    const handlerPath = path.resolve(this.#projectPath, handler)
    const runtime = this.#agentConfig.runtime || 'python3.13'

    // Reject unsupported/malformed runtimes before deriving any command.
    // The config schema can't be relied on here: `dev` reads the raw
    // `initialServerlessConfig`, never runs the package lifecycle, and ajv
    // config validation is advisory by default (configValidationMode 'warn'
    // logs but does not block). So we enforce the same allowlist at the point
    // of use. Normalize via the same logic as #getPythonCommand so a value
    // that passes is guaranteed to map onto a supported `python3.x` binary name.
    // Guard for non-string values (e.g. an unquoted `runtime: 3.13` parsed as a
    // number) so they yield the clear error below rather than a raw TypeError.
    const normalizedRuntime =
      typeof runtime === 'string' ? this.#normalizePythonRuntime(runtime) : null
    if (
      normalizedRuntime === null ||
      !SUPPORTED_AGENT_RUNTIMES.includes(normalizedRuntime)
    ) {
      throw new ServerlessError(
        `Unsupported agent runtime "${runtime}". The "runtime" option only ` +
          `selects the Python version and must be one of: ` +
          `${SUPPORTED_AGENT_RUNTIMES.join(', ')}. To use a specific Python ` +
          `installation (a pyenv build, Homebrew, a custom location), activate ` +
          `a virtualenv or adjust your PATH — "runtime" only chooses the ` +
          `version, and the matching interpreter is resolved from your environment.`,
        'AGENTCORE_INVALID_RUNTIME',
      )
    }

    // Get Python command
    const pythonCmd = this.#getPythonCommand(runtime)

    // Check Python version and warn if mismatch
    await this.#checkPythonVersion(pythonCmd, runtime)

    // Setup virtual environment in PATH if available
    this.#setupVirtualEnv()

    logger.debug(`Starting Python process: ${pythonCmd} ${handlerPath}`)

    // Build environment for Python process
    // Match Docker mode (dev/index.js lines 454-465) with minimal environment
    const pythonEnv = {}

    // System essentials (required for Python to run)
    pythonEnv.PATH = process.env.PATH
    pythonEnv.USER = process.env.USER
    pythonEnv.LANG = process.env.LANG || 'en_US.UTF-8'

    // Virtual environment if active AND exists
    if (process.env.VIRTUAL_ENV && fs.existsSync(process.env.VIRTUAL_ENV)) {
      pythonEnv.VIRTUAL_ENV = process.env.VIRTUAL_ENV
      if (process.env.VIRTUAL_ENV_PROMPT) {
        pythonEnv.VIRTUAL_ENV_PROMPT = process.env.VIRTUAL_ENV_PROMPT
      }
      logger.debug(`Using virtual environment: ${process.env.VIRTUAL_ENV}`)
    } else if (process.env.VIRTUAL_ENV) {
      logger.warning(
        `VIRTUAL_ENV is set but directory doesn't exist: ${process.env.VIRTUAL_ENV}. ` +
          'Using system Python instead.',
      )
    }

    // Port configuration
    pythonEnv.PORT = String(this.#port)

    // AWS credentials - identical to Docker mode (lines 455-459 in dev/index.js)
    pythonEnv.AWS_ACCESS_KEY_ID = credentials.AccessKeyId
    pythonEnv.AWS_SECRET_ACCESS_KEY = credentials.SecretAccessKey
    pythonEnv.AWS_SESSION_TOKEN = credentials.SessionToken
    pythonEnv.AWS_REGION = this.#region
    pythonEnv.AWS_DEFAULT_REGION = this.#region

    // AgentCore specific - identical to Docker mode (lines 461-463)
    pythonEnv.AGENTCORE_DEV_MODE = 'true'
    pythonEnv.PYTHONUNBUFFERED = '1'

    // User-defined environment variables - identical to Docker mode (line 465)
    if (this.#agentConfig.environment) {
      Object.assign(pythonEnv, this.#agentConfig.environment)
    }

    // Start the Python process
    this.#process = spawn(pythonCmd, [handlerPath], {
      cwd: this.#projectPath,
      env: pythonEnv,
    })

    // Immediately attach stdout/stderr listeners to capture early output
    // This prevents log loss if the process crashes during import/startup
    this.#process.stdout.on('data', (data) => {
      const text = data.toString()
      // Log to debug by default (index.js will handle display formatting)
      logger.debug(`[stdout] ${text}`)
    })

    this.#process.stderr.on('data', (data) => {
      const text = data.toString()
      // Always show stderr immediately - it contains errors, tracebacks, etc.
      // Use console.error to ensure immediate visibility even during startup
      console.error(text)
    })

    // Handle process errors
    this.#process.on('error', (error) => {
      if (error.code === 'ENOENT') {
        logger.error(
          `Python runtime '${pythonCmd}' not found. ` +
            `Please install Python or update artifact.runtime in serverless.yml`,
        )
      } else {
        logger.error(`Failed to start Python process: ${error.message}`)
      }
    })

    // Handle process exit
    this.#process.on('exit', (code, signal) => {
      if (!this.#isShuttingDown) {
        if (code !== 0) {
          logger.error(`Python process exited with code ${code}.`)
        }
      }
    })

    return this.#process
  }

  /**
   * Stop the Python process
   */
  async stop() {
    if (!this.#process || this.#isShuttingDown) {
      return
    }

    this.#isShuttingDown = true

    // Send SIGTERM for graceful shutdown
    this.#process.kill('SIGTERM')

    // Wait for graceful shutdown (max 2 seconds)
    const timeout = asyncSetTimeout(2000)
    const exit = new Promise((resolve) => {
      this.#process.once('exit', resolve)
    })

    await Promise.race([exit, timeout])

    // Force kill if still running
    if (this.#process.exitCode === null) {
      logger.debug('Process did not exit gracefully, sending SIGKILL')
      this.#process.kill('SIGKILL')
    }

    this.#process = null
    this.#isShuttingDown = false
  }

  /**
   * Get the process for log streaming
   */
  getProcess() {
    return this.#process
  }

  /**
   * Get the watch path for file watching
   */
  getWatchPath() {
    // Watch entire project for Python file changes
    return this.#projectPath
  }

  /**
   * Get file patterns to watch
   */
  getWatchPatterns() {
    return {
      include: ['**/*.py'],
      exclude: [
        '**/venv/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/*.pyc',
        '**/node_modules/**',
        '**/.git/**',
        '**/.pytest_cache/**',
        '**/.mypy_cache/**',
      ],
    }
  }

  /**
   * Get Python command from runtime
   * @private
   */
  #getPythonCommand(runtime) {
    if (process.platform === 'win32') {
      return 'python.exe'
    }

    return this.#normalizePythonRuntime(runtime)
  }

  /**
   * Normalize a user-supplied runtime string to its canonical `python3.x`
   * command form (e.g. 'PYTHON_3_12' -> 'python3.12'). Used both to validate
   * the runtime against the supported allowlist and to derive the command on
   * non-Windows platforms.
   * @private
   */
  #normalizePythonRuntime(runtime) {
    const version = runtime
      .toLowerCase()
      .replace(/^python/, '')
      .replace(/^_/, '')
      .replace(/_/g, '.')
    return `python${version}`
  }

  /**
   * Setup virtual environment in PATH
   * @private
   */
  #setupVirtualEnv() {
    if (!process.env.VIRTUAL_ENV) {
      return
    }

    const runtimeDir = os.platform() === 'win32' ? 'Scripts' : 'bin'
    const venvBinPath = path.join(process.env.VIRTUAL_ENV, runtimeDir)

    // Prepend venv bin to PATH
    process.env.PATH = [venvBinPath, path.delimiter, process.env.PATH].join('')

    logger.debug(`Using virtual environment: ${process.env.VIRTUAL_ENV}`)
  }

  /**
   * Check Python version and warn if mismatch
   * @private
   */
  async #checkPythonVersion(pythonCmd, expectedRuntime) {
    try {
      const { stdout } = await execFileP(pythonCmd, ['--version'])
      const installedVersion = stdout.trim() // "Python 3.13.1"
      const expectedVersion = expectedRuntime
        .toLowerCase()
        .replace(/^python/, '')
        .replace(/^_/, '')
        .replace(/_/g, '.')

      if (!installedVersion.includes(expectedVersion)) {
        logger.warning(
          `Python version mismatch: ` +
            `Expected ${expectedVersion}, found ${installedVersion}. ` +
            `This may cause compatibility issues.`,
        )
      }
    } catch (error) {
      // Ignore version check failures
      logger.debug(`Could not check Python version: ${error.message}`)
    }
  }
}
