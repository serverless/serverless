const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Saves the invocation result to a temporary file in JSON format.
 * The file is named with the process ID to avoid conflicts between concurrent invocations.
 * The result includes both the response and the error if any.
 *
 * @param {*} result
 * @returns {void}
 */
const saveInvocationResult = (result) => {
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
 * @param {string} handlerFileAbsolutePath - Path to handler file
 * @param {string} handlerName - The Handler Name defined in the config file
 * @returns {Promise<Function>}
 */
const importFunction = async (handlerFileAbsolutePath, handlerName) => {
  try {
    // Delete the cached file to ensure user changes are imported
    if (require.cache[handlerFileAbsolutePath]) {
      delete require.cache[handlerFileAbsolutePath];
    }

    return require(handlerFileAbsolutePath)[handlerName];
  } catch (error) {
    if (error.code === 'ERR_REQUIRE_ESM') {
      // Unlike require, we need to add a cache buster to the import statement to ensure user changes are imported
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
 * @param {{ event: any, partialContext: any }} options
 * @returns <Promise<any>} a promise that resolves with the response from the handler function
 * @throws {Error} if the handler function is not a function, or if the handler function throws an error
 */
const invokeFunction = async (handlerFunction, { event, partialContext }) => {
  if (typeof handlerFunction !== 'function') {
    throw new Error(`Handler is not a function`);
  }

  return new Promise(async (resolve, reject) => {
    const callback = (error, response) => {
      if (error) {
        reject(error);
      }

      resolve(response);
    };

    const timeout = 900; // todo this should match the function timeout
    const startTime = new Date();

    const context = {
      ...partialContext, // This is the  context we received via WebSockets
      succeed(result) {
        return callback(null, result);
      },
      fail(error) {
        return callback(error, null);
      },
      done(error, result) {
        return callback(error, result);
      },
      getRemainingTimeInMillis() {
        return Math.max(timeout * 1000 - (new Date().valueOf() - startTime.valueOf()), 0);
      },
    };

    try {
      const response = await handlerFunction(event, context, callback);

      resolve(response);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * We parse all the data passed in by the parent process
 */
const {
  handlerFileAbsolutePath,
  handlerName,
  event,
  context: partialContext,
} = JSON.parse(process.argv[2]);

(async () => {
  try {
    // Import and register ts-node
    require('ts-node').register({});
    // Import and invoke the handler function
    const response = await invokeFunction(
      await importFunction(handlerFileAbsolutePath, handlerName),
      { event, partialContext }
    );

    // Save the response for the parent process to fetch and return to Lambda
    saveInvocationResult({ response, error: null });
  } catch (error) {
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
