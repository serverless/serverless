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
  return `${datasetName}-unsubscriber-axiom`
}

/**
 * Prepares the parameters for creating or updating a CloudFormation stack for the Axiom unsubscriber.
 *
 * @param {Object} params - The parameters.
 * @param {[string]} [params.cloudWatchLogGroupNames] - CloudWatch Log Group names to be associated with the forwarder.
 * @returns {CreateStackCommandInput} The parameters required to create or update the CloudFormation stack.
 */
export function prepareUnsubscriberStackParams({
  datasetName,
  cloudWatchLogGroupNames,
}) {
  const templateURL = `https://axiom-cloudformation.s3.amazonaws.com/stacks/axiom-cloudwatch-unsubscriber-v${AXIOM_CLOUDFORMATION_STACKS_VERSION}-cloudformation-stack.yaml`
  const stackName = getStackName(datasetName)
  return {
    StackName: stackName,
    TemplateURL: templateURL,
    Parameters: [
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

export async function createOrUpdateUnsubscriber({
  datasetName,
  awsCredentials,
  region,
  cloudWatchLogGroupNames,
}) {
  const params = prepareUnsubscriberStackParams({
    datasetName,
    cloudWatchLogGroupNames,
  })
  return await createOrUpdateCloudFormationStack({
    credentials: awsCredentials,
    region,
    params,
  })
}
