import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { addProxyToAwsClient } from '@serverless/util'

export const resolveVariableFromCloudFormation = async (
  logger,
  credentials,
  config,
  region,
  key,
) => {
  const [stackName, outputKey] = key.split('.')
  const client = addProxyToAwsClient(
    new CloudFormationClient({ credentials, region }),
  )
  const command = new DescribeStacksCommand({ StackName: stackName })
  const result = await (async () => {
    try {
      return await client.send(command)
    } catch (error) {
      if (
        error.name === 'ValidationError' &&
        error.message.includes('does not exist')
      ) {
        logger.debug(`Output ${outputKey} not found in stack ${stackName}`)
        return null
      }
      throw error
    }
  })()

  if (!result) {
    return null
  }

  const stack = result.Stacks[0]
  const output = stack.Outputs.find((output) => output.OutputKey === outputKey)
  if (!output?.OutputValue) {
    return null
  }
  return output.OutputValue
}
