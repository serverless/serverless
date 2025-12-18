import {
  GetParameterCommand,
  ParameterNotFound,
  SSMClient,
} from '@aws-sdk/client-ssm'
import { addProxyToAwsClient } from '@serverless/util'

export const resolveVariableFromSsm = async (
  logger,
  credentials,
  region,
  key,
  resolutionDetails,
) => {
  const shouldReturnRawValue = resolutionDetails?.rawOrDecrypt === 'raw'
  const shouldSkipDecryption = resolutionDetails?.rawOrDecrypt === 'noDecrypt'
  const client = addProxyToAwsClient(
    new SSMClient({
      credentials,
      region,
    }),
  )
  const command = new GetParameterCommand({
    Name: key,
    WithDecryption: !shouldSkipDecryption,
  })
  const result = await (async () => {
    try {
      return await client.send(command)
    } catch (error) {
      const name = error.name
      if (error instanceof ParameterNotFound || name === 'ParameterNotFound') {
        logger.debug(`SSM parameter ${key} not found`)
        return null
      }
      throw error
    }
  })()

  if (!result) {
    return null
  }

  switch (result.Parameter.Type) {
    case 'String':
      return result.Parameter.Value
    case 'StringList':
      return shouldReturnRawValue
        ? result.Parameter.Value
        : result.Parameter.Value.split(',')
    case 'SecureString':
      if (shouldReturnRawValue || !result.Parameter.Value.startsWith('{')) {
        return result.Parameter.Value
      }
      try {
        return JSON.parse(result.Parameter.Value)
      } catch {
        return result.Parameter.Value
      }
    default:
      throw new Error(`Unexpected parameter type: "${result.Parameter.Type}"`)
  }
}
