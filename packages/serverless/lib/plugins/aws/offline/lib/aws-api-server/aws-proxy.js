/**
 * Reverse proxy that forwards requests for AWS services the offline emulator
 * does not handle to real AWS, re-signed with the developer's deploy
 * credentials. Enabled only when `proxyToAws: 'unsupported'`.
 */

/**
 * Per-service endpoint overrides for services that do not follow the standard
 * `https://<service>.<region>.amazonaws.com` regional pattern. Empty for now;
 * exotic/global services fall through to the null path and surface a clear
 * error rather than a wrong guess.
 *
 * @type {Record<string, (region: string) => string>}
 */
const ENDPOINT_OVERRIDES = {}

/**
 * Build the real AWS endpoint for a service+region, or null when it cannot be
 * constructed confidently.
 *
 * @param {string} service - SigV4 signing service name (e.g. 'dynamodb').
 * @param {string} region  - AWS region (e.g. 'us-east-1').
 * @returns {string | null}
 */
export function buildAwsEndpoint(service, region) {
  if (!service || !region) {
    return null
  }
  if (ENDPOINT_OVERRIDES[service]) {
    return ENDPOINT_OVERRIDES[service](region)
  }
  return `https://${service}.${region}.amazonaws.com`
}
