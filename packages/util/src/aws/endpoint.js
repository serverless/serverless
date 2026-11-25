import { resolveEndpointConfig } from '@smithy/core/endpoints'

/**
 * The endpoint the AWS SDK for JavaScript v3 sends a service's requests to when the user configured
 * one, or undefined when the SDK would use the service's default AWS endpoint.
 *
 * The SDK reads, in this order: the `AWS_ENDPOINT_URL_<SERVICE_ID>` environment variable,
 * `AWS_ENDPOINT_URL`, then `endpoint_url` in the `services` section the profile names and the
 * profile's own `endpoint_url` in the shared config file (the profile is `AWS_PROFILE`, else
 * `default`). `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` or the profile's
 * `ignore_configured_endpoint_urls` turns all of them off.
 * https://docs.aws.amazon.com/sdkref/latest/guide/feature-ss-endpoints.html
 *
 * This asks the SDK's own resolver rather than reimplementing it, so the AWS SDK v2 requests and
 * every v3 client the CLI creates pick the same endpoint for a service.
 *
 * @param {string} serviceId - The service's SDK id, as in its API model (`CloudFormation`,
 *   `CloudWatch Logs`, `API Gateway`).
 * @returns {Promise<string|undefined>}
 */
export const getConfiguredAwsEndpoint = async (serviceId) => {
  const endpoint = await resolveEndpointConfig({
    serviceId,
  }).serviceConfiguredEndpoint()
  return typeof endpoint === 'string' && endpoint.trim() !== ''
    ? endpoint.trim()
    : undefined
}

/**
 * The AWS endpoint settings that apply to this process, for a notice that names them: the endpoint
 * the deployment's CloudFormation requests go to (`AWS_ENDPOINT_URL_CLOUDFORMATION`,
 * `AWS_ENDPOINT_URL` or `endpoint_url` in the shared config file) and the names of the set
 * `AWS_ENDPOINT_URL_<SERVICE_ID>` variables the SDK uses. Empty when none is set or
 * `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` turns them off.
 *
 * @returns {Promise<{ endpoint?: string, serviceVariables: string[] }>}
 */
export const describeConfiguredAwsEndpoints = async () => {
  const env = process.env
  const endpoint = await getConfiguredAwsEndpoint('CloudFormation')
  const serviceVariables = []
  for (const name of Object.keys(env).sort()) {
    const value = env[name]
    if (!name.startsWith('AWS_ENDPOINT_URL_') || !value?.trim()) continue
    // The SDK reads AWS_ENDPOINT_URL_CLOUDWATCH_LOGS for the service id "CloudWatch Logs"; it
    // resolves nothing when the settings are turned off, so those variables are left out.
    const serviceId = name.slice('AWS_ENDPOINT_URL_'.length).replace(/_/g, ' ')
    if ((await getConfiguredAwsEndpoint(serviceId)) === value.trim()) {
      serviceVariables.push(name)
    }
  }
  return endpoint ? { endpoint, serviceVariables } : { serviceVariables }
}
