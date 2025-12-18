/**
 * Safely converts any value to a string representation.
 * - If the value is already a string, it is returned as-is.
 * - If the value is an object (including arrays), JSON.stringify is used.
 * - Otherwise, the default toString() method is used.
 *
 * @param {*} value - The value to be converted.
 * @returns {string} The string representation of the value.
 */
const safeStringify = (value) => {
  if (typeof value === 'string') {
    return value
  }
  if (value !== null && typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (err) {
      // Fallback if JSON.stringify fails.
      return value.toString()
    }
  }
  return value.toString()
}

/**
 * Gets environment variables to set for containers.
 * Sets standard SCF environment variables and injects any environment variables set in the container config.
 * This is important to use when setting environment variables for containers because it
 * converts provided options to key-value pairs, ensures any non string value is converted to a string,
 * and omits keys with undefined or null values. Framework Variables can be of any type, but environment
 * variables for containers must be strings.
 *
 * @param {Object} options - Container environment options
 * @param {*} [options.name] - Container name
 * @param {*} [options.stage] - Deployment stage
 * @param {*} [options.containerName] - Name of the container
 * @param {*} [options.computeType] - Compute type
 * @param {*} [options.routingPathPattern] - Routing path pattern
 * @param {Object} [options.environment] - Container environment variables
 * @param {*} [options.localProxyPort] - Local proxy port
 * @param {boolean} [options.isLocal] - Whether container is running locally
 * @param {*} [options.port] - Container port
 * @returns {Object} Environment variables as key-value pairs
 */
export const getContainerEnvVars = ({
  name,
  stage,
  containerName,
  computeType,
  routingPathPattern,
  environment = {},
  localProxyPort,
  isLocal = false,
  port,
}) => {
  const envVars = {}

  if (name !== undefined && name !== null) {
    envVars.SERVERLESS_NAMESPACE = safeStringify(name)
  }

  if (stage !== undefined && stage !== null) {
    envVars.SERVERLESS_STAGE = safeStringify(stage)
  }

  if (containerName !== undefined && containerName !== null) {
    envVars.SERVERLESS_CONTAINER_NAME = safeStringify(containerName)
  }

  if (computeType !== undefined && computeType !== null) {
    envVars.SERVERLESS_COMPUTE_TYPE = safeStringify(computeType)
  }

  if (routingPathPattern !== undefined && routingPathPattern !== null) {
    envVars.SERVERLESS_ROUTING_PATH_PATTERN = safeStringify(routingPathPattern)
  }

  if (localProxyPort !== undefined && localProxyPort !== null) {
    envVars.SERVERLESS_LOCAL_PROXY_PORT = safeStringify(localProxyPort)
  }

  if (isLocal !== undefined && isLocal !== null) {
    envVars.SERVERLESS_LOCAL = safeStringify(isLocal)
  }

  if (port !== undefined && port !== null) {
    envVars.PORT = safeStringify(port)
  }

  if (computeType === 'awsLambda') {
    envVars.AWS_LWA_INVOKE_MODE = 'response_stream'
  }

  // Process the provided environment object, converting each non-string value to a string
  // and omitting any keys whose values are undefined or null.
  const processedEnvironment = {}
  Object.keys(environment).forEach((key) => {
    const value = environment[key]
    if (value !== undefined && value !== null) {
      processedEnvironment[key] = safeStringify(value)
    }
  })

  return {
    ...envVars,
    ...processedEnvironment,
    TERM: 'xterm-256color', // Always include TERM variable for terminal color support
  }
}
