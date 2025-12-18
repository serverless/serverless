import {
  Capability,
  CloudFormationClient,
  CloudFormationServiceException,
  CreateStackCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { AXIOM_CLOUDFORMATION_STACKS_VERSION } from './index.js'
import { addProxyToAwsClient } from '@serverless/util'

/**
 * @typedef {import('@aws-sdk/client-cloudformation').CreateStackCommandOutput} CreateStackCommandOutput
 * @typedef {import('@aws-sdk/client-cloudformation').UpdateStackCommandOutput} UpdateStackCommandOutput
 * @typedef {import('@aws-sdk/client-cloudformation').Stack} Stack
 * @typedef {import('@aws-sdk/client-cloudformation').CreateStackCommandInput} CreateStackCommandInput
 */

/**
 * @typedef {(CreateStackCommandOutput | UpdateStackCommandOutput) & { action: 'create' | 'update' }} CreateOrUpdateForwarderResult
 */

/**
 * Generates the CloudFormation stack name based on the dataset name.
 *
 * @param {string} datasetName - The name of the dataset.
 * @returns {string} - The generated stack name.
 */
function getStackName(datasetName) {
  return `${datasetName}-forwarder-axiom`
}

/**
 * Retrieves the CloudFormation stack for the specified dataset.
 *
 * @param {Object} params - The parameters.
 * @param {Object} params.awsCredentials - The AWS credentials
 * @param {string} params.region - The AWS region.
 * @param {string} params.datasetName - The name of the dataset.
 * @returns {Promise<Stack|undefined>} - The CloudFormation stack or undefined if it does not exist.
 */
const getForwarder = async ({ awsCredentials, region, datasetName }) => {
  const cloudFormationClient = addProxyToAwsClient(
    new CloudFormationClient({
      region,
      credentials: awsCredentials,
    }),
  )
  const stackName = getStackName(datasetName)
  const params = {
    StackName: stackName,
  }
  try {
    const stacks = await cloudFormationClient.send(
      new DescribeStacksCommand(params),
    )
    return stacks?.Stacks?.[0]
  } catch (e) {
    const name = e.name
    // When the stack does not exist, CloudFormation returns a ValidationError
    // with a message like "Stack with id ... does not exist".
    if (
      e?.message?.includes('does not exist') &&
      (e instanceof CloudFormationServiceException ||
        name === 'ValidationError')
    ) {
      return
    }
    throw e
  }
}

/**
 * Retrieves the Lambda ARN from Stack Outputs.
 *
 * @param {Object} params - The parameters.
 * @param {Stack} params.stack - The CloudFormation stack.
 * @returns {string} - The Lambda ARN.
 * @throws {Error} - Throws an error if the CloudWatchLogGroupNames parameter is not found.
 */
const getLambdaArnOutput = ({ stack }) => {
  const outputs = stack.Outputs
  if (!outputs) {
    throw new Error(`No outputs found in stack ${stack.StackName}`)
  }
  const lambdaArn = outputs.find(
    (output) => output.OutputKey === 'ForwarderLambdaARN',
  )
  if (!lambdaArn) {
    throw new Error(
      `ForwarderLambdaARN not found in stack ${stack.StackName} outputs`,
    )
  }
  const lambdaArnValue = lambdaArn.OutputValue
  if (!lambdaArnValue) {
    throw new Error(
      `ForwarderLambdaARN value not found in stack ${stack.StackName} outputs`,
    )
  }
  return lambdaArnValue
}

/**
 * Retrieves the Lambda ARN of the forwarder.
 *
 * @param {Object} params - The parameters.
 * @param {Object} params.awsCredentials - The AWS credentials
 * @param {string} params.region - The AWS region.
 * @param {string} params.datasetName - The name of the dataset.
 * @returns {Promise<string>} - The Lambda ARN.
 */
export const getForwarderLambdaArn = async ({
  awsCredentials,
  region,
  datasetName,
}) => {
  const stack = await getForwarder({
    awsCredentials,
    region,
    datasetName,
  })
  if (!stack) {
    throw new Error(`Forwarder stack not found for dataset ${datasetName}`)
  }
  return getLambdaArnOutput({ stack })
}

/**
 * Prepares the parameters for creating or updating a CloudFormation stack for the Axiom forwarder.
 *
 * @param {Object} params - The parameters.
 * @param {string} params.datasetName - The name of the Axiom dataset.
 * @param {string} params.axiomToken - The Axiom API token.
 * @returns {CreateStackCommandInput} The parameters required to create or update the CloudFormation stack.
 */
export function prepareForwarderStackParams({ datasetName, axiomToken }) {
  const templateURL = `https://axiom-cloudformation.s3.amazonaws.com/stacks/axiom-cloudwatch-forwarder-v${AXIOM_CLOUDFORMATION_STACKS_VERSION}-cloudformation-stack.yaml`
  const stackName = getStackName(datasetName)
  return {
    StackName: stackName,
    TemplateURL: templateURL,
    Parameters: [
      {
        ParameterKey: 'AxiomDataset',
        ParameterValue: datasetName,
      },
      {
        ParameterKey: 'AxiomToken',
        ParameterValue: axiomToken,
      },
      {
        ParameterKey: 'DataTags',
        ParameterValue: '',
      },
    ],
    Capabilities: [Capability.CAPABILITY_IAM],
  }
}

/**
 * Creates the CloudFormation stack for the Axiom forwarder.
 *
 * @param {Object} params - The parameters.
 * @param {string} params.axiomToken - The Axiom API token.
 * @param {Object} params.awsCredentials - The AWS credentials.
 * @param {string} params.region - The AWS region.
 * @param {string} params.datasetName - The name of the dataset.
 * @returns {Promise<CreateStackCommandOutput|void>} - The result of the create operation or void if the stack already exists.
 */
export const createForwarder = async ({
  axiomToken,
  awsCredentials,
  region,
  datasetName,
}) => {
  const cloudFormationClient = addProxyToAwsClient(
    new CloudFormationClient({
      region,
      credentials: awsCredentials,
    }),
  )
  const params = prepareForwarderStackParams({
    datasetName,
    axiomToken,
  })
  try {
    return {
      ...(await cloudFormationClient.send(new CreateStackCommand(params))),
    }
  } catch (e) {
    const name = e.name
    // Creating a stack that already exists raises AlreadyExistsException
    // with a message like "Stack [name] already exists".
    if (
      e?.message?.includes('already exists') &&
      (e instanceof CloudFormationServiceException ||
        name === 'AlreadyExistsException')
    ) {
      return
    }
    throw e
  }
}
