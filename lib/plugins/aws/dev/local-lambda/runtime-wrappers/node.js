import { pathToFileURL } from 'url'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { inspect } from 'util'

const originaStdoutlWrite = process.stdout.write
const originaStderrlWrite = process.stderr.write

// Overwrite process.stdout.write
process.stdout.write = (chunk, encoding, callback) => {
  try {
    // Attempt to parse chunk as JSON
    const obj = JSON.parse(chunk.trim())
    // Utilize util.inspect to improve the readability of the object
    const formatted = inspect(obj, { colors: true, depth: null })

    // Call the original stdout.write with the formatted string
    originaStdoutlWrite.call(
      process.stdout,
      formatted + '\n',
      encoding,
      callback,
    )
  } catch (error) {
    // If it's not JSON, just output the original message
    originaStdoutlWrite.call(process.stdout, chunk, encoding, callback)
  }
}

// Overwrite process.stdout.write
process.stderr.write = (chunk, encoding, callback) => {
  try {
    // Attempt to parse chunk as JSON
    const obj = JSON.parse(chunk.trim())
    // inspect without color because stderr is red
    const formatted = inspect(obj, { colors: false, depth: null })

    // Call the original stdout.write with the formatted string
    originaStderrlWrite.call(
      process.stderr,
      formatted + '\n',
      encoding,
      callback,
    )
  } catch (error) {
    // If it's not JSON, just output the original message
    originaStderrlWrite.call(process.stderr, chunk, encoding, callback)
  }
}

/**
 * Custom log function that formats objects with colors regardless of their depth.
 *
 * @param {*} originalFunction Original console function to be modified
 * @returns
 */
function customLog(originalFunction) {
  return function (...args) {
    args = args.map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        // Format the object with colors and unlimited depth
        return inspect(arg, { colors: true, depth: null })
      }
      return arg
    })
    originalFunction.apply(console, args)
  }
}

/**
 * We apply the custom log function only to the console.log and console.info functions.
 * console.error and console.warn are printed in red and handled by the parent process.
 * We don't need to handle process.stdout.write and process.stderr.write
 * Because they can't don't accept objects anyway.
 */
console.log = customLog(console.log)
console.info = customLog(console.info)

/**
 * Saves the invocation result to a temporary file in JSON format.
 * The file is named with the process ID to avoid conflicts between concurrent invocations.
 * The result includes both the response and the error if any.
 *
 * @param {*} result
 * @returns {void}
 */
const saveInvocationResult = (result) => {
  const filePath = path.join(os.tmpdir(), `sls_${process.pid}.json`)

  const stringifiedResult = JSON.stringify(result, null, 2)

  fs.writeFileSync(filePath, stringifiedResult)
}

/**
 * Imports the user handler function from the specified file path.
 * This supports both CommonJS and ESM handler files.
 *
 * @param {string} handlerFileAbsolutePath - Path to handler file
 * @param {string} handlerName - The Handler Name defined in the config file
 * @returns {Promise<Function>}
 */
const importFunction = async (handlerFileAbsolutePath, handlerName) => {
  // Check if the file exists
  if (!fs.existsSync(handlerFileAbsolutePath)) {
    throw new Error(`Handler file was not found: ${handlerFileAbsolutePath}`)
  }

  // Convert the file path to a file URL to ensure
  // it works across different operating systems
  // and for both CommonJS and ESM handler files
  const fileUrl = pathToFileURL(handlerFileAbsolutePath).href

  // Import the handler file. This works for both CommonJS and ESM handler files
  const handlerFunction = (await import(fileUrl))[handlerName]

  // Make sure the handler is a function
  if (typeof handlerFunction !== 'function') {
    throw new Error(`Handler is not a function`)
  }

  // return the function to be invoked
  return handlerFunction
}
/**
 * Invoke the handler function with the event, context and callback.
 * We add context functions to the context object we received via WebSockets.
 *
 * @param {*} handlerFunction The handler function to invoke
 * @param {{ event: any, partialContext: any }} options
 * @returns <Promise<any>} a promise that resolves with the response from the handler function
 * @throws {Error} if the handler function is not a function, or if the handler function throws an error
 */
const invokeFunction = async (handlerFunction, { event, partialContext }) => {
  return new Promise(async (resolve, reject) => {
    const callback = (error, response) => {
      if (error) {
        reject(error)
      } else {
        resolve(response)
      }
    }

    const startTime = new Date()

    const context = {
      ...partialContext,
      succeed(result) {
        callback(null, result)
      },
      fail(error) {
        callback(error, null)
      },
      done(error, result) {
        callback(error, result)
      },
      getRemainingTimeInMillis() {
        return Math.max(
          context.timeout * 1000 - (new Date().valueOf() - startTime.valueOf()),
          0,
        )
      },
    }

    try {
      const response = await handlerFunction(event, context, callback)
      resolve(response)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * We parse all the data passed in by the parent process
 */
const inputArgs = JSON.parse(process.argv[2])
const { handlerFileAbsolutePath, handlerName, event, partialContext } =
  inputArgs

;(async () => {
  try {
    // Import and invoke the handler function
    const handler = await importFunction(handlerFileAbsolutePath, handlerName)

    const response = await invokeFunction(handler, { event, partialContext })

    // Save the response for the parent process to fetch and return to Lambda
    saveInvocationResult({ response, error: null })
  } catch (error) {
    // Save the error for the parent process to fetch and return to Lambda
    saveInvocationResult({
      response: null,
      error: { name: error.name, message: error.message, stack: error.stack },
    })

    // Exit the child process in case of errors
    console.error(error)
    process.exit(1)
  }
})()
