import { GetParameterCommand, ParameterNotFound } from '@aws-sdk/client-ssm'
import { sendAwsRequest } from './clients.js'

export const resolveVariableFromSsm = async (
  logger,
  credentials,
  region,
  key,
  resolutionDetails,
) => {
  const shouldReturnRawValue = resolutionDetails?.rawOrDecrypt === 'raw'
  const shouldSkipDecryption = resolutionDetails?.rawOrDecrypt === 'noDecrypt'
  const result = await (async () => {
    try {
      return await sendAwsRequest({
        service: 'ssm',
        credentials,
        region,
        logger,
        command: new GetParameterCommand({
          Name: key,
          WithDecryption: !shouldSkipDecryption,
        }),
        target: key,
      })
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
