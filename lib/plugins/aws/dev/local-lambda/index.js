import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import pkg from 'lodash'
import { fileURLToPath } from 'url'
import utils from '@serverlessinc/sf-core/src/utils.js'
const { log, style } = utils
const logger = log.get('sls:dev:local-lambda')
import ServerlessError from '@serverlessinc/sf-core/src/utils/errors/serverlessError.js'

const { flatten } = pkg
let __dirname = path.dirname(fileURLToPath(import.meta.url))
if (__dirname.endsWith('dist')) {
  __dirname = path.join(__dirname, '../lib/plugins/aws/dev/local-lambda')
}
/**
 * This is the main Local Lambda class that will be used to invoke local lambda functions.
 * Each instance of this class represents a single lambda function instance that can be invoked.
 *
 * @class
 * @param {Object} [config={}] - The configuration object for the Local Lambda.
 * @param {string} config.handler - The AWS Lambda handler.
 * @param {string} config.runtime - The AWS Lambda runtime.
 * @param {Object} [config.environment={}] - An object representing environment variables to set for the local lambda instance in addition to the current process environment.
 * @param {string} config.serviceAbsolutePath - The absolute path to the service directory.
 *
 * @property {string} handler - The AWS Lambda handler.
 * @property {string} runtime - The AWS Lambda runtime.
 * @property {Object} environment - The local lambda environment variables.
 * @property {string} serviceAbsolutePath - The absolute path to the service directory.
 *
 * @example
 * const config = {
 *   handler: 'index.handler',
 *   runtime: 'nodejs20.x',
 *   environment: { FOO: 'BAR' },
 *   serviceAbsolutePath: '~/path/to/service'
 * };
 *
 * const localLambda = new LocalLambda(config);
 */
class LocalLambda {
  constructor(config = {}) {
    this.serviceAbsolutePath = config.serviceAbsolutePath

    const supportedRuntimes = flatten(
      runtimeWrappers.map((runtimeWrapper) => runtimeWrapper.versions),
    )

    if (!supportedRuntimes.includes(config.runtime)) {
      throw new ServerlessError(
        `Unsupported runtime: "${config.runtime}"`,
        `DEV_MODE_UNSUPPORTED_RUNTIME`,
        { stack: false },
      )
    }

    this.handler = config.handler
    this.runtime = config.runtime
    this.environment = {
      ...process.env,
      ...(config.environment || {}),
    }
    this.invocationColorFn = config.invocationColorFn
  }

  /**
   * Asynchronously retrieves the absolute path of the handler file, considering possible file extensions.
   *
   * This method constructs the absolute path of the handler file based on the handler name provided in the class instance,
   * the service's absolute path, and the runtime environment. It checks for possible file extensions that match the runtime
   * environment's expected file types and returns the first matching handler file's absolute path.
   *
   * @async
   * @returns {Promise<string>} A promise that resolves to the absolute path of the handler file.
   * If no files are found, an error will be thrown.
   *
   * @example
   * const handlerFileAbsolutePath = await localLambda.getHandlerFileAbsolutePath();
   * console.log(handlerFileAbsolutePath); // Outputs: "/path/to/service/handler.js"
   */
  async getHandlerFileAbsolutePath() {
    // Extract the handler file name without the extension.
    const handlerFileName = this.handler.split('.')[0]

    // Construct the absolute path to the handler file without the extension.
    const handlerFileAbsolutePathWithoutExtension = path.resolve(
      this.serviceAbsolutePath,
      handlerFileName,
    )

    // Get a list of possible extensions based on the specified runtime
    // ex. ['.js', '.mjs', '.js', '.ts']
    const possibleExtensions = flatten(
      runtimeWrappers
        .filter((runtimeWrapper) =>
          runtimeWrapper.versions.includes(this.runtime),
        )
        .map((possibleRuntime) => possibleRuntime.extensions),
    )

    // Get a list of possible handler file paths with the different extensions
    // and check to see which one exists
    const possibleHandlerFiles = await Promise.all(
      possibleExtensions.map(async (ext) => {
        return {
          path: `${handlerFileAbsolutePathWithoutExtension}${ext}`,
          exists: await fileExists(
            `${handlerFileAbsolutePathWithoutExtension}${ext}`,
          ),
        }
      }),
    )

    // Find the handler file that actually exists
    const handlerFileAbsolutePath = possibleHandlerFiles.find(
      (file) => file.exists,
    )?.path

    // If none of the possible handler files exist, throw an error
    if (!handlerFileAbsolutePath) {
      throw new ServerlessError(
        `Handler "${this.handler}" not found in service directory`,
        'DEV_MODE_HANDLER_NOT_FOUND',
        { stack: false },
      )
    }

    return handlerFileAbsolutePath
  }

  /**
   * Asynchronously invokes the specified handler function with the provided event object, executing it in a child process
   * based on the runtime environment configuration.
   *
   * The function captures and filters the child process's stdout and stderr streams, extracting the execution result
   * encapsulated between '__RESULT_START__' and '__RESULT_END__' delimiters.
   *
   * @async
   * @param {Object} [event={}] - The event object to be passed to the handler function. Defaults to an empty object if not provided.
   * @param {Object} [context={}] - The context object to be passed to the handler function. Defaults to an empty object if not provided.
   * @returns {Promise<any>} A promise that resolves with the result of the handler function's execution.
   *
   * @example
   * const event = { key: 'value' }; // Example event object
   * const context = { key: 'value' }; // Example context object
   * const result = await instance.invoke(event, context);
   * console.log(result); // Outputs the handler's execution result
   */
  async invoke(event = {}, context = {}) {
    // get the absolute path of the handler file set in the class instance
    const handlerFileAbsolutePath = await this.getHandlerFileAbsolutePath()

    // extract the handler name from the handler string
    const handlerName = this.handler.split('.')[1]

    // find the runtime wrapper that supports the handler file extension
    const runtimeWrapper = runtimeWrappers.find((runtimeWrapper) =>
      runtimeWrapper.extensions.includes(path.extname(handlerFileAbsolutePath)),
    )

    return new Promise((resolve, reject) => {
      /**
       * Construct the arguments to be passed to the child process:
       *   - The handler file's absolute path to be imported by the wrapper
       *   - The handler function name to be called by the wrapper
       *   - The event that will be passed as an argument to the handler function
       *   - The context that will be passed as a second argument to the handler function
       */
      const argsString = JSON.stringify({
        handlerFileAbsolutePath,
        handlerName,
        event,
        context,
      })

      const childEnv = { ...this.environment }

      // Spawn a child process to execute the runtime wrapper and set the specified environment variables
      const child = spawn(
        runtimeWrapper.command,
        [...runtimeWrapper.arguments, runtimeWrapper.path, argsString],
        {
          env: childEnv,
          cwd: this.serviceAbsolutePath,
        },
      )

      // Write standard output
      child.stdout.on('data', (data) => {
        const dataString = data.toString().trim()

        dataString.split('\n').forEach((line) => {
          logger.notice(`${this.invocationColorFn('─')} ${line}`)
        })
      })

      // Write error output
      child.stderr.on('data', (data) => {
        logger.notice(
          `${this.invocationColorFn('─')} ${style.error(
            data.toString().trim(),
          )}`,
        )
      })

      // Handles child process errors, not user function errors
      child.on('error', (error) => {
        logger.notice(
          `${this.invocationColorFn('─')} ${style.error(
            `Child process error: ${error.message}`,
          )}`,
        )
      })

      child.on('close', async (code) => {
        try {
          const result = await getInvocationResult(child.pid)

          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}

/**
 * Gets the invocation result from the temporary file created by the runtime wrapper,
 * then deletes the file for cleanup. The result is parsed from JSON and returned.
 *
 * @param {*} childProcessId - The ID of the child process that executed the runtime wrapper to construct the unique file name.
 *
 * @returns {Promise<any>} A promise that resolves with the parsed result from the temporary file.
 */
const getInvocationResult = async (childProcessId) => {
  try {
    const filePath = path.join(os.tmpdir(), `sls_${childProcessId}.json`)

    const result = await fs.readFile(filePath, 'utf8')

    // delete the temporary file after reading its contents
    await fs.unlink(filePath)

    return JSON.parse(result)
  } catch (e) {
    return {
      response: null,
      error: { name: 'InternalServerError' },
    }
  }
}

/**
 * Asynchronously checks if a file exists at the specified file path.
 *
 * @async
 * @function fileExists
 * @param {string} filePath - The path to the file whose existence is to be checked.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the file exists, or `false` if it does not.
 * @example
 * async function checkFile() {
 *   const exists = await fileExists('./example.txt');
 *   console.log(exists ? 'File exists' : 'File does not exist');
 * }
 */
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath, fs.constants.F_OK)
    return true
  } catch (error) {
    return false
  }
}

/**
 * This is a list of runtime wrappers that we currently support.
 * It is easily extensible to support more runtimes.
 * Each wrapper has a:
 *   - Command to be executed (e.g. 'node', 'ts-node')
 *   - Path to the wrapper file that the command will execute
 *   - List of runtime versions that the wrapper supports
 *   - List of file extensions that the wrapper supports
 */
const runtimeWrappers = [
  {
    command: 'node',
    arguments: [],
    path: path.join(__dirname, 'runtime-wrappers/node.js'),
    versions: [
      'nodejs14.x',
      'nodejs16.x',
      'nodejs18.x',
      'nodejs20.x',
      'nodejs22.x',
    ],
    extensions: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'],
  },
]

export default LocalLambda
