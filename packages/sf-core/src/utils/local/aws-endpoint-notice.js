import { log } from '@serverless/util'
import { describeConfiguredAwsEndpoints } from '@serverless/util/src/aws/endpoint.js'

/**
 * A one-line notice naming the AWS endpoints the user configured with AWS_ENDPOINT_URL,
 * AWS_ENDPOINT_URL_<SERVICE> or endpoint_url in the shared config file, so a command that talks to
 * a local emulator (or to anything other than AWS) says so. Undefined when none is configured.
 */
export const configuredAwsEndpointNotice = async () => {
  let configured
  try {
    configured = await describeConfiguredAwsEndpoints()
  } catch (error) {
    // A malformed config file: the AWS SDK reports it on the first request
    log
      .get('core:aws-endpoint')
      .debug('Could not read the configured AWS endpoints', error)
    return undefined
  }
  const { endpoint, serviceVariables } = configured
  const variables = serviceVariables.join(', ')
  if (endpoint && variables) {
    return `Using the configured AWS endpoint ${endpoint} and the endpoints set by ${variables}`
  }
  if (endpoint) return `Using the configured AWS endpoint ${endpoint}`
  if (variables) return `Using the configured AWS endpoints set by ${variables}`
  return undefined
}
