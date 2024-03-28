import path from 'path';
import os from 'os';
import fs from 'fs';

const {
  handlerFileAbsolutePath,
  handlerName,
  event,
  context: partialContext,
} = JSON.parse(process.argv[2]);

/**
 * Saves the invocation result to a temporary file in JSON format.
 * The file is named with the process ID to avoid conflicts between concurrent invocations.
 * The result includes both the response and the error if any.
 *
 * @param {*} result
 * @returns {void}
 */
const saveInvocationResult = (result: any) => {
  const filePath = path.join(os.tmpdir(), `sls_${process.pid}.json`);

  const stringifiedResult = JSON.stringify(result, null, 2);

  fs.writeFileSync(filePath, stringifiedResult);
};

/**
 * Imports the user handler function from the specified file path.
 * We first try to require the file, and if it fails with ERR_REQUIRE_ESM, we import it.
 * This supports both CommonJS and ESM handler files.
 * If the file is already cached, it is deleted to ensure the latest version is imported
 * as the user makes changes during the dev mode session
 *
 * @returns {Promise<Function>}
 */
const importFunction = async () => {
  try {
    if (require.cache[handlerFileAbsolutePath]) {
      delete require.cache[handlerFileAbsolutePath];
    }

    return require(handlerFileAbsolutePath)[handlerName];
  } catch (error: any) {
    if (error.code === 'ERR_REQUIRE_ESM') {
      const cacheBuster = Date.now().toString();
      return (await import(`${handlerFileAbsolutePath}?${cacheBuster}`))[handlerName];
    }

    throw error;
  }
};

/**
 * Invoke the handler function with the event, context and callback.
 * We add context functions to the context object we received via WebSockets.
 *
 * @param {*} handlerFunction The handler function to invoke
 * @returns {<Promise<any>} a promise that resolves with the response from the handler function
 * @throws {Error} if the handler function is not a function, or if the handler function throws an error
 */
const invokeFunction = async (handlerFunction: Function) => {
  if (typeof handlerFunction !== 'function') {
    throw new Error(`Handler is not a function`);
  }

  return new Promise(async (resolve, reject) => {
    const callback = (error: any, response: any) => {
      if (error) {
        reject(error);
      }

      resolve(response);
    };

    const timeout = 900; // todo this should match the function timeout
    const startTime = new Date();

    const context = {
      ...partialContext, // This is the  context we received via WebSockets
      succeed(result: any) {
        return callback(null, result);
      },
      fail(error: any) {
        return callback(error, null);
      },
      done(error: any, result: any) {
        return callback(error, result);
      },
      getRemainingTimeInMillis() {
        return Math.max(timeout * 1000 - (new Date().valueOf() - startTime.valueOf()), 0);
      },
    };

    try {
      const response = await handlerFunction(event, context, callback);

      resolve(response);
    } catch (error: any) {
      reject(error);
    }
  });
};

(async () => {
  try {
    // Import and invoke the handler function
    const response = await invokeFunction(await importFunction());

    // Save the response for the parent process to fetch and return to Lambda
    saveInvocationResult({ response, error: null });
  } catch (error: any) {
    // Save the error for the parent process to fetch and return to Lambda
    saveInvocationResult({
      response: null,
      error: { name: error.name, message: error.message, stack: error.stack },
    });

    // Exit the child process in case of errors
    console.error(error);
    process.exit(1);
  }
})();
