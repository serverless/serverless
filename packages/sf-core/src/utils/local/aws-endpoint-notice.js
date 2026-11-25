import { log } from '@serverless/util'
import { describeConfiguredAwsEndpoints } from '@serverless/util/src/aws/endpoint.js'

/**
 * A one-line notice naming the AWS endpoints the user configured with AWS_ENDPOINT_URL,
 * AWS_ENDPOINT_URL_<SERVICE> or endpoint_url in the shared config file, so a command that talks to
 * a local emulator (or to anything other than AWS) says so, and which calls use them. Undefined
 * when none is configured.
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
  let notice
  if (endpoint && variables) {
    notice = `Using the configured AWS endpoint ${endpoint} and the endpoints set by ${variables}`
  } else if (endpoint) {
    notice = `Using the configured AWS endpoint ${endpoint}`
  } else if (variables) {
    notice = `Using the configured AWS endpoints set by ${variables}`
  } else {
    return undefined
  }
  // The Framework's AWS SDK v2 code path, the default for deploy, remove, info, logs and most
  // other commands, sends its calls to AWS's own endpoints; SLS_AWS_SDK=3 moves them to the v3
  // code path, whose clients use the configured endpoint.
  if (String(process.env.SLS_AWS_SDK || '').toLowerCase() === '3') return notice
  return `${notice} for AWS SDK v3 calls. Calls on the AWS SDK v2 code path go to AWS's own endpoints; set SLS_AWS_SDK=3 to send them to the configured endpoint`
}
