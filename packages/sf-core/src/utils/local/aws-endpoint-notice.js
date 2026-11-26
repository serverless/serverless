import { log } from '@serverless/util'
import { describeConfiguredAwsEndpoints } from '@serverless/util/src/aws/endpoint.js'

/**
 * The endpoint URL as the notice prints it, with any user name and password replaced by `***`, so
 * credentials in the URL stay out of the terminal and CI logs. The SDK keeps using the URL as set.
 */
const withoutUserInfo = (endpoint) => {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return endpoint
  }
  if (!url.username && !url.password) return endpoint
  return endpoint.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/?#]*@/i, '$1***@')
}

/**
 * A one-line message naming the AWS endpoints the user configured with AWS_ENDPOINT_URL,
 * AWS_ENDPOINT_URL_<SERVICE> or endpoint_url in the shared config file, so a command that talks to
 * a local emulator (or to anything other than AWS) says so, and which calls use them, with the
 * level to print it at: `notice` with SLS_AWS_SDK=3, when every call uses them; `warning` without
 * it, when the AWS SDK v2 calls still go to AWS. Undefined when none is configured.
 * @returns {Promise<{ level: 'notice' | 'warning', message: string } | undefined>}
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
  const { serviceVariables, configServices = [] } = configured
  const endpoint = configured.endpoint && withoutUserInfo(configured.endpoint)
  const sources = []
  if (serviceVariables.length > 0) {
    sources.push(`endpoints set by ${serviceVariables.join(', ')}`)
  }
  if (configServices.length > 0) {
    sources.push(
      `endpoints set for ${configServices.join(', ')} in the shared config file`,
    )
  }
  let notice
  if (endpoint && sources.length > 0) {
    notice = `Using the configured AWS endpoint ${endpoint} and the ${sources.join(' and the ')}`
  } else if (endpoint) {
    notice = `Using the configured AWS endpoint ${endpoint}`
  } else if (sources.length > 0) {
    notice = `Using the configured AWS ${sources.join(' and the ')}`
  } else {
    return undefined
  }
  // The Framework's AWS SDK v2 code path, the default for deploy, remove, info, logs and most
  // other commands, sends its calls to AWS's own endpoints; SLS_AWS_SDK=3 moves them to the v3
  // code path, whose clients use the configured endpoint.
  if (String(process.env.SLS_AWS_SDK || '').toLowerCase() === '3') {
    return { level: 'notice', message: notice }
  }
  return {
    level: 'warning',
    message: `${notice} for AWS SDK v3 calls. Calls on the AWS SDK v2 code path go to AWS's own endpoints; set SLS_AWS_SDK=3 to send them to the configured endpoint`,
  }
}
