/**
 * This is the shim that is injected into all service functions when the Serverless Dev Mode is enabled.
 * It is responsible for forwarding the invocation event to the local machine and returning the response.
 */

import iot from 'aws-iot-device-sdk';

// This is the function identifier that is used to identify the function that is being invoked
const functionId = process.env.SLS_DEV_MODE_FUNCTION_ID;

// List of env vars that should not be sent to the local machine
const envVarsToIgnore = ['PATH', 'NODE_PATH', 'LD_LIBRARY_PATH', 'PWD', 'SHLVL'];

// List of env vars that should be sent to the local machine
const envVarsToSend = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => !envVarsToIgnore.includes(key))
);

const device = new iot.device({
  protocol: 'wss',
  host: process.env.SLS_DEV_MODE_IOT_ENDPOINT,
});

device.on('error', (...args) => {
  console.error('AWS IoT connection error occurred');
  console.error(args);
});
device.on('connect', (...args) => {
  console.log('Successfully connected to AWS IoT');
  console.log(args);
});
device.on('close', (...args) => {
  console.log('AWS IoT connection closed');
  console.log(args);
});

// Subscribe to the result topic to receive the response from the local machine
device.subscribe(`${functionId}/result`, {
  qos: 1,
});

/**
 * Listens for a message from a device and resolves with the response or an error within a specified timeout period.
 *
 * This function sets up two promises: one that listens for a single 'message' event from the device, and another that acts as a timeout.
 * The first promise attempts to parse the incoming message as JSON, distinguishing between successful responses and errors based on
 * the parsed content. If an error is detected, it constructs an Error instance with details from the received message and rejects the promise.
 * If a successful response is received, it resolves with the response data. The second promise serves as a fallback, resolving with a
 * predefined message after a 30-second wait, indicating a timeout occurred. `Promise.race` is used to ensure that the function resolves or
 * rejects based on whichever promise settles first, effectively implementing a timeout mechanism for the operation.
 *
 * @returns {Promise<string|Object>} A promise that either resolves with the successful response from the device or a timeout message,
 * or rejects with an Error instance if the device reports an error. The promise resolves with a string message if the operation times out.
 */
const waitForResponse = async () => {
  // We race between two promises. Either we receive a message from the local machine or we timeout after 30 seconds.
  return Promise.race([
    new Promise((resolve, reject) => {
      device.once('message', async (topic, buffer) => {
        // Parse the result message from the local machine, which includes the response or any errors
        const { response, error } = JSON.parse(buffer.toString());

        // In case of an error, fail the lambda invocation with the error
        if (error) {
          const errorInstance = new Error(error.message); // The error message as streamed from the local machine
          errorInstance.stack = error.stack; // The error stack as streamed from the local machine
          errorInstance.name = error.name; // The error name as streamed from the local machine

          reject(errorInstance);
        }

        // In case of a successful response, resolve the lambda invocation with the response
        resolve(response);
      });
    }),
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve(
            'Serverless Dev Mode is enabled on this Lambda function, but we have not received a response from your local machine.'
          ),
        25 * 1000 // Wait for at least 25 seconds to get a response from the local machine
      );
    }),
  ]);
};

/**
 * Publishes a message to a specified topic on AWS IoT.
 *
 * This function sends a message to a given topic using AWS IoT's publish method. It wraps the publish action in a Promise
 * to handle asynchronous execution. The message is serialized to JSON format before sending.
 *
 * @async
 * @param {string} topic - The topic to which the message will be published.
 * @param {Object} message - The message payload to be published. The payload is converted to a JSON string before publishing.
 * @returns {Promise<Object>} A promise that resolves with the message payload if the message is successfully published,
 * or rejects with an error if the publication fails.
 * @throws Will log an error to the console and reject the promise if publishing the message fails.
 */
const publishMessage = async (topic, message) => {
  return new Promise((resolve, reject) => {
    device.publish(
      topic,
      JSON.stringify(message),
      {
        qos: 1, // Quality of Service level. This gives the message prioirty.
      },
      (error) => {
        if (error) {
          console.error(`Failed to publish message to AWS IoT: ${error.message}`);
          reject(error);
        } else {
          console.log('Message successfully published to AWS IoT:');
          console.log(message);
          resolve(message);
        }
      }
    );
  });
};

/**
 * Invokes a Lambda function, publishes its context and event to a specified topic, and waits for a response.
 * This function first deconstructs the `context` object provided by AWS Lambda to extract non-function context properties to send to the local machine.
 * The function then calls `publishMessage` to this function's invocation topic.
 * After publishing the message, the function waits for a response using `waitForResponse`.
 * The response from `waitForResponse` is then returned to the caller.
 *
 * @param {Object} event - The event data that triggered the Lambda function. This could be from an S3 event, DynamoDB, custom events, etc.
 * @param {Object} context - The AWS Lambda execution context, providing metadata and settings related to the function's invocation.
 * @returns {Promise<Object>} The response from `waitForResponse`, expected to be the result of the external operation initiated by publishing the message.
 */
export const handler = async (event, context) => {
  const {
    functionName,
    functionVersion,
    memoryLimitInMB,
    logGroupName,
    logStreamName,
    clientContext,
    identity,
    invokedFunctionArn,
    awsRequestId,
    callbackWaitsForEmptyEventLoop,
  } = context; // Extract the context properties that are not functions

  await publishMessage(`${functionId}/invocation`, {
    event, // Send the event to the local machine
    environment: envVarsToSend, // Send the environment variables to the local machine
    context: {
      // Send the context properties to the local machine
      functionName,
      functionVersion,
      memoryLimitInMB,
      logGroupName,
      logStreamName,
      clientContext,
      identity,
      invokedFunctionArn,
      awsRequestId,
      callbackWaitsForEmptyEventLoop,
    },
  });

  // Wait for the response from the local machine
  const response = await waitForResponse();

  // return the response to the Lambda caller
  return response;
};
