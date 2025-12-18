import { createOrUpdateCloudFormationStack } from './cloudformation.js'
import { Capability } from '@aws-sdk/client-cloudformation'
import { AXIOM_CLOUDFORMATION_STACKS_VERSION } from './index.js'

/**
 * Generates the CloudFormation stack name based on the dataset name.
 *
 * @param {string} datasetName - The name of the dataset.
 * @returns {string} - The generated stack name.
 */
function getStackName(datasetName) {
  return `${datasetName}-subscriber-axiom`
}

/**
 * Prepares the parameters for creating or updating a CloudFormation stack for the Axiom subscriber.
 *
 * @param {Object} params - The parameters.
 * @param {string} params.forwarderLambdaArn - The ARN of the Axiom CloudWatch forwarder Lambda.
 * @param {[string]} [params.cloudWatchLogGroupNames] - CloudWatch Log Group names to be associated with the forwarder.
 * @returns {CreateStackCommandInput} The parameters required to create or update the CloudFormation stack.
 */
export function prepareSubscriberStackParams({
  datasetName,
  forwarderLambdaArn,
  cloudWatchLogGroupNames,
}) {
  const templateURL = `https://axiom-cloudformation.s3.amazonaws.com/stacks/axiom-cloudwatch-subscriber-v${AXIOM_CLOUDFORMATION_STACKS_VERSION}-cloudformation-stack.yaml`
  const stackName = getStackName(datasetName)
  return {
    StackName: stackName,
    TemplateURL: templateURL,
    Parameters: [
      {
        ParameterKey: 'AxiomCloudWatchForwarderLambdaARN',
        ParameterValue: forwarderLambdaArn,
      },
      {
        ParameterKey: 'CloudWatchLogGroupNames',
        ParameterValue: cloudWatchLogGroupNames.join(','),
      },
      {
        ParameterKey: 'ForceUpdate',
        ParameterValue: Math.random().toString(36).substring(7),
      },
    ],
    Capabilities: [Capability.CAPABILITY_IAM],
  }
}

export async function createOrUpdateSubscriber({
  datasetName,
  awsCredentials,
  region,
  forwarderLambdaArn,
  cloudWatchLogGroupNames,
}) {
  const params = prepareSubscriberStackParams({
    datasetName,
    forwarderLambdaArn,
    cloudWatchLogGroupNames,
  })
  return await createOrUpdateCloudFormationStack({
    credentials: awsCredentials,
    region,
    params,
  })
}
