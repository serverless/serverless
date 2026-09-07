import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { sendAwsRequest } from './clients.js'

/**
 * Resolve `${cf:<stackName>.<outputKey>}`.
 *
 * One `DescribeStacks` call is made per (credentials, region, stack) — every
 * output of that stack, from any resolver or Compose service, is read from the
 * same response. That memo lasts until a runner invalidates it after a service
 * run that may have changed the stack (see `invalidateAwsResponseCache`), so a
 * service ordered after such a run reads the new outputs.
 *
 * @returns {Promise<string|null>} the output value, or `null` when the stack
 *   or the output does not exist (so fallbacks can apply)
 */
export const resolveVariableFromCloudFormation = async (
  logger,
  credentials,
  config,
  region,
  key,
) => {
  const [stackName, outputKey] = key.split('.')
  if (!stackName || !outputKey) {
    throw new ServerlessError(
      `Invalid CloudFormation variable '\${cf:${key}}': expected '<stackName>.<outputKey>'.`,
      ServerlessErrorCodes.resolvers.RESOLVER_INVALID_CF_ADDRESS,
      { stack: false },
    )
  }

  let result
  try {
    result = await sendAwsRequest({
      service: 'cloudformation',
      credentials,
      region,
      logger,
      command: new DescribeStacksCommand({ StackName: stackName }),
      target: stackName,
      cache: true,
    })
  } catch (error) {
    if (
      error.name === 'ValidationError' &&
      error.message.includes('does not exist')
    ) {
      logger.debug(`Stack '${stackName}' does not exist in ${region}`)
      return null
    }
    throw error
  }

  const outputs = result.Stacks[0].Outputs ?? []
  const output = outputs.find((entry) => entry.OutputKey === outputKey)
  if (!output?.OutputValue) {
    const available = outputs.map((entry) => entry.OutputKey).join(', ')
    logger.debug(
      `Output '${outputKey}' not found in stack '${stackName}' (available: ${available || 'none'})`,
    )
    return null
  }
  return output.OutputValue
}
