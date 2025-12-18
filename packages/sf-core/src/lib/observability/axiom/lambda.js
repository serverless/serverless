import { fetchLatestLayerVersion, getLayerArn } from './layer.js'

/**
 * @typedef {Object} LambdaAxiomConfig
 * @property {string} layerArn - The ARN of the Lambda layer.
 * @property {Object} environment - The environment variables for the Lambda function.
 * @property {string} environment.AXIOM_TOKEN - The Axiom token.
 * @property {string} environment.AXIOM_DATASET - The Axiom dataset name.
 */

/**
 * Retrieves the Lambda configuration with the Axiom layer ARN and environment variables.
 *
 * @param {Object} params - The parameters for the Lambda configuration.
 * @param {string} params.token - The Axiom token.
 * @param {string} params.datasetName - The Axiom dataset name.
 * @param {string} params.region - The AWS region.
 * @param {string} params.arch - The architecture type.
 * @param {number} params.layerVersion - The version of the layer.
 * @returns {Promise<LambdaAxiomConfig>} - A promise that resolves to the Lambda configuration.
 */
export const getLambdaConfig = async ({
  token,
  datasetName,
  region,
  arch,
  layerVersion,
}) => {
  const layerArn = await getLayerArn({ region, arch, version: layerVersion })
  return {
    layerArn,
    environment: {
      AXIOM_TOKEN: token,
      AXIOM_DATASET: datasetName,
    },
  }
}

/**
 * @typedef {Object} LambdaFunctionParam
 * @property {string} name - The name of the Lambda function.
 * @property {string} arch - The architecture type.
 * @property {string} cloudWatchLogGroupName - The CloudWatch log group name.
 */

/**
 * Retrieves the Lambda configurations for multiple Lambda functions.
 *
 * @param {string} token - The Axiom token.
 * @param {string} region - The AWS region.
 * @param {string} datasetName - The Axiom dataset name.
 * @param {LambdaFunctionParam[]} [lambdaFunctions] - The list of Lambda function parameters.
 * @returns {Promise<(LambdaFunctionParam & LambdaAxiomConfig)[]>} - A promise that resolves to a list of Lambda configurations.
 */
export const getLambdaConfigsForFunctions = async (
  token,
  region,
  datasetName,
  lambdaFunctions,
) => {
  if (!lambdaFunctions) {
    return []
  }
  const lambdaConfigs = []
  const layerVersion = await fetchLatestLayerVersion()
  for (const lambdaFunction of lambdaFunctions) {
    const lambdaConfig = await getLambdaConfig({
      token,
      datasetName,
      region,
      arch: lambdaFunction.arch,
      layerVersion,
    })
    lambdaConfigs.push({
      ...lambdaFunction,
      ...lambdaConfig,
    })
  }
  return lambdaConfigs
}

/**
 * Retrieves the log groups that are not associated with any Lambda function.
 * @param {LambdaFunctionParam[]} [lambdaFunctions] - An array of Lambda function parameters.
 * @param {string[]} resourcesLogGroupNames - An array of CloudWatch Log Group names to unsubscribe.
 * @returns {string[]} - An array of CloudWatch Log Group names that are not associated with any Lambda function.
 */
export const nonLambdaLogGroups = ({
  lambdaFunctions,
  resourcesLogGroupNames,
}) => {
  const functionsLogGroupNames = lambdaFunctions.map(
    (f) => f.cloudWatchLogGroupName,
  )
  return Array.from(new Set(resourcesLogGroupNames)).filter(
    (name) => !functionsLogGroupNames.includes(name),
  )
}
