// The REST API base URL is published by the api-gateway compiler as the
// `ServiceEndpoint` stack output (`../../package/compile/events/api-gateway/lib/deployment.js`).
// The info plugin's own endpoint scan is deliberately looser - it also matches
// `HttpApiUrl` - but MCP routes are compiled onto the REST API alone, so only
// the exact key can stand in for their origin.
const SERVICE_ENDPOINT_OUTPUT_KEY = 'ServiceEndpoint'

export const serviceEndpointOf = (outputs = []) =>
  outputs.find((output) => output.OutputKey === SERVICE_ENDPOINT_OUTPUT_KEY)
    ?.OutputValue

/**
 * Entries for the `mcp` service-output section.
 *
 * The section renderer (`lib/cli/write-service-outputs.js`) prints the section
 * name itself, so the entries carry no `mcp: ` prefix. It also prints an array
 * as an indented list under an `mcp:` header and a string inline, so rendering
 * a lone server as `mcp: crm → …` is up to the caller passing the single entry
 * on its own rather than wrapped in an array.
 *
 * `baseUrls` is `resolveBaseUrls` (`./discovery-route.js`) - the same map the
 * published OAuth discovery documents are built from, which is what makes the
 * printed URL and the URL a document advertises the same string by construction
 * rather than by two derivations agreeing. Its entry wins over the stack output
 * because it is the URL clients are handed: under
 * `provider.apiGateway.disableDefaultEndpoint` the execute-api URL does not
 * answer at all.
 *
 * A `stage`-sourced entry carries no URL, because at package time it is a
 * CloudFormation intrinsic - and the fallback is the deployed stack's own
 * `ServiceEndpoint` output because that is the same address with the REST API id
 * filled in: both are the API Gateway stage URL, built on
 * `getApiGatewayStage()`, so a renamed `provider.apiGateway.stage` moves them
 * together.
 *
 * A server with no origin at all is left out on its own: one service can hold
 * both a server that names its own URL and one that has none to print.
 *
 * `baseUrls` is required: there is one caller, and defaulting it would turn a
 * mis-wiring into a summary that quietly printed stage URLs for everything.
 */
export const formatMcpEndpoints = ({ servers, serviceEndpoint, baseUrls }) => {
  const lines = []
  for (const server of servers) {
    const baseUrl = baseUrls.get(server.name)?.url ?? serviceEndpoint
    if (!baseUrl) continue
    lines.push(`${server.name} → ${baseUrl}/${server.name}/mcp`)
  }
  return lines
}
