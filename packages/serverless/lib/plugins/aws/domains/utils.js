import Globals from './globals.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

/**
 * Stops event thread execution for given number of seconds.
 * @param {number} seconds
 * @returns {Promise<void>} Resolves after given number of seconds.
 */
async function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, 1000 * seconds))
}

/**
 * Determines whether this boolean config is configured to true or false.
 *
 * This method evaluates a customDomain property to see if it's true or false.
 * If the property's value is undefined, the default value is returned.
 * If the property's value is provided, this should be boolean, or a string parseable as boolean,
 * otherwise an exception is thrown.
 * @param {boolean|string} value the config value provided
 * @param {boolean} defaultValue the default value to return, if config value is undefined
 * @returns {boolean} the parsed boolean from the config value, or the default value
 */
function evaluateBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue
  }

  const s = value.toString().toLowerCase().trim()
  const trueValues = ['true', '1']
  const falseValues = ['false', '0']
  if (trueValues.indexOf(s) >= 0) {
    return true
  }
  if (falseValues.indexOf(s) >= 0) {
    return false
  }
  throw new ServerlessError(
    `${Globals.pluginName}: Ambiguous boolean config: "${value}"`,
    ServerlessErrorCodes.domains.DOMAIN_CONFIG_AMBIGUOUS_BOOLEAN,
  )
}

/**
 * Iterate through the pages of an AWS SDK v3 response and collect them into a single array
 *
 * @param {Object} client - The AWS SDK v3 client instance
 * @param {string} resultsKey - The key name in the response that contains the items to return
 * @param {string} nextTokenKey - The request key name to append to the request that has the paging token value
 * @param {string} nextResponseTokenKey - The response key name that has the next paging token value
 * @param {Object} command - The AWS SDK v3 Command instance to execute
 * @returns {Promise<Array>} Promise that resolves to an array of results
 */
async function getAWSPagedResults(
  client,
  resultsKey,
  nextTokenKey,
  nextResponseTokenKey,
  command,
) {
  let results = []
  let response = await client.send(command)
  results = results.concat(response[resultsKey] || results)

  while (nextResponseTokenKey in response && response[nextResponseTokenKey]) {
    command.input[nextTokenKey] = response[nextResponseTokenKey]
    response = await client.send(command)
    results = results.concat(response[resultsKey])
  }

  return results
}

export { evaluateBoolean, sleep, getAWSPagedResults }
