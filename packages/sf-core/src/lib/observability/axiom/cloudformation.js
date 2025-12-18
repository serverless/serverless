import {
  CloudFormationClient,
  CloudFormationServiceException,
  CreateStackCommand,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation'
import { addProxyToAwsClient } from '@serverless/util'

export async function createOrUpdateCloudFormationStack({
  credentials,
  region,
  params,
}) {
  const cloudFormationClient = addProxyToAwsClient(
    new CloudFormationClient({
      region,
      credentials,
    }),
  )
  try {
    return {
      ...(await cloudFormationClient.send(new UpdateStackCommand(params))),
      action: 'update',
    }
  } catch (e) {
    if (e?.message?.includes('No updates are to be performed')) {
      return
    }
    const name = e.name
    // When the stack does not exist, CloudFormation returns a ValidationError
    // with a message like "Stack [name] does not exist".
    if (
      e?.message?.includes('does not exist') &&
      (e instanceof CloudFormationServiceException ||
        name === 'ValidationError')
    ) {
      return {
        ...(await cloudFormationClient.send(new CreateStackCommand(params))),
        action: 'create',
      }
    }
    throw e
  }
}
