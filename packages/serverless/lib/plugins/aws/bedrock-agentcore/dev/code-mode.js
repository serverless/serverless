'use strict'

import path from 'path'
import os from 'os'
import fs from 'fs'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'
import { setTimeout as asyncSetTimeout } from 'node:timers/promises'
import { log } from '@serverless/util'

const execP = promisify(exec)
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
    const entryPoint = this.#agentConfig.artifact.entryPoint[0]
    const entryPointPath = path.resolve(this.#projectPath, entryPoint)
    const runtime = this.#agentConfig.artifact?.runtime || 'PYTHON_3_13'

    // Get Python command
    const pythonCmd = this.#getPythonCommand(runtime)

    // Check Python version and warn if mismatch
    await this.#checkPythonVersion(pythonCmd, runtime)

    // Setup virtual environment in PATH if available
    this.#setupVirtualEnv()

    logger.debug(`Starting Python process: ${pythonCmd} ${entryPointPath}`)

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
    this.#process = spawn(pythonCmd, [entryPointPath], {
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

    // Convert PYTHON_3_13 to python3.13
    // Remove PYTHON_ prefix, replace remaining underscores with dots, prepend 'python'
    const version = runtime.replace('PYTHON_', '').replace(/_/g, '.')
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
      const { stdout } = await execP(`${pythonCmd} --version`)
      const installedVersion = stdout.trim() // "Python 3.13.1"
      const expectedVersion = expectedRuntime
        .replace('PYTHON_', '')
        .replace(/_/g, '.') // "3.13"

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
