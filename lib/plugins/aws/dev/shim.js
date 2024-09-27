/**
 * This is the shim that is injected into all service functions when the Serverless Dev Mode is enabled.
 * It is responsible for forwarding the invocation event to the local machine and returning the response.
 */

import iot from 'aws-iot-device-sdk'

// List of env vars that should not be sent to the local machine
const envVarsToIgnore = ['PATH', 'NODE_PATH', 'LD_LIBRARY_PATH', 'PWD', 'SHLVL']

// List of env vars that should be sent to the local machine
const envVarsToSend = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !envVarsToIgnore.includes(key)),
)

/**
 * Constructs a topic id based on the provided topic name.
 *
 * @param {*} topicName
 * @returns topic id
 */
const constructTopicId = (topicName) => {
  const region = process.env.AWS_REGION
  const service = process.env.SLS_SERVICE
  const stage = process.env.SLS_STAGE

  let topicId = `sls/${region}/${service}/${stage}`

  if (topicName) {
    topicId += `/${topicName}`
  }

  return topicId
}

const topics = {
  // This is the topic that the local machine listens to for incoming invocations
  request: constructTopicId(`${process.env.SLS_FUNCTION}/request`),
  // This is the topic that the lambda function listens to for the response from the local machine
  response: constructTopicId(`${process.env.SLS_FUNCTION}/response`),
  // This is the topic that the lambda function listens to for the heartbeat from the local machine
  heartbeat: constructTopicId(`_heartbeat`),
}

const responses = new Map()

const device = new iot.device({
  protocol: 'wss',
  host: process.env.SLS_IOT_ENDPOINT,
})

device.on('connect', () => {
  console.log('Successfully connected to AWS IoT')
})

device.on('close', (...args) => {
  console.log('AWS IoT connection closed')
  console.log(args)
})

device.on('error', (...args) => {
  console.error('AWS IoT connection error occurred')
  console.error(args)
})

device.on('message', async (topic, messageBuffer) => {
  const message = JSON.parse(messageBuffer?.toString() || '{}')

  console.log('Received message from AWS IoT:')
  console.log(topic)

  if (topic === topics.heartbeat) {
    responses.set(topics.heartbeat, Date.now()) // Set the heartbeat time received
  }

  if (topic === topics.response && message.requestId) {
    responses.set(message.requestId, message)
  }
})

// Subscribe to the heartbeat topic to check if the local machine is still connected
device.subscribe(topics.heartbeat, {
  qos: 1,
})

// Subscribe to the response topic to receive the response or error from the local machine
device.subscribe(topics.response, {
  qos: 1,
})

// Just a sleep function
const waitForMs = (ms = 1000) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(), ms)
  })

/**
 *
 * This function resolves only if we haven't received a heartbeat message from the local machine in the last 2 seconds.
 * If we receive a heartbeat message, we wait for 2 seconds and then call the function again to check again.
 * @returns
 */
const waitForNoResponse = async () => {
  // Wait for 2 seconds to check if we received a heartbeat message
  // This also leaves a buffer for the first heartbeat to be received
  await waitForMs(2000)

  const lastHeartbeat = responses.get(topics.heartbeat)

  // We send a heartbeat every second, so here we make sure the last heartbeat was received no more than 2 seconds ago (leaving a 1-second buffer)
  const isConnected = lastHeartbeat && Date.now() - lastHeartbeat < 2000

  if (isConnected) {
    return await waitForNoResponse()
  }

  return "Dev Mode Disconnected: This AWS Lambda function is instrumented with Serverless Framework's Dev Mode but the Dev Mode session is no longer active. Run `serverless dev` to reconnect, or `serverless deploy` to remove Dev Mode's instrumentation and restore the original code."
}

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
const waitForResponse = async (requestId) => {
  const { response, error } = await waitForMessage(requestId)

  // In case of an error, fail the lambda invocation with the error
  if (error) {
    console.error(
      'Error occurred during lambda invocation on the local machine:',
    )
    const errorInstance = new Error(error.message) // The error message as streamed from the local machine
    errorInstance.stack = error.stack // The error stack as streamed from the local machine
    errorInstance.name = error.name // The error name as streamed from the local machine

    throw errorInstance
  }

  // In case of a successful response, resolve the lambda invocation with the response
  return response
}

const waitForMessage = async (id) => {
  while (!responses.get(id)) {
    await waitForMs(100)
  }

  const message = responses.get(id)

  responses.delete(id)

  return message
}

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
      message ? JSON.stringify(message) : '{}',
      {
        qos: 1, // Quality of Service level. This gives the message prioirty.
      },
      (error) => {
        if (error) {
          console.error(
            `Failed to publish message to AWS IoT: ${error.message}`,
          )
          reject(error)
        } else {
          console.log('Message successfully published to AWS IoT topic:')
          console.log(topic)
          resolve(message)
        }
      },
    )
  })
}

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
  } = context // Extract the context properties that are not functions

  await publishMessage(topics.request, {
    event, // Send the event to the local machine
    environment: envVarsToSend, // Send the environment variables to the local machine
    context: {
      // Send the context properties to the local machine
      awsRequestId,
      functionName,
      functionVersion,
      memoryLimitInMB,
      logGroupName,
      logStreamName,
      clientContext,
      identity,
      invokedFunctionArn,
      callbackWaitsForEmptyEventLoop,
    },
  })

  // Wait for the response from the local machine, or a timeout message if no response is received
  const response = await Promise.race([
    waitForResponse(awsRequestId),
    waitForNoResponse(),
  ])

  // return the response to the Lambda caller
  return response
}
