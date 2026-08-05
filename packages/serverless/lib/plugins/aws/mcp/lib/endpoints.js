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
 * The origin a server names for itself, or undefined when it names none.
 *
 * SERVERLESS_MCP_PUBLIC_BASE_URL in a server's own `environment` is the
 * documented way to state an origin the Framework cannot see - a CloudFront
 * distribution, two REST domains - and the entry treats it as absolute
 * (`../entry/lib/compose.mjs`), so it is exactly what that server advertises to
 * clients. Printing anything else would hand out an address the server's own
 * OAuth metadata contradicts.
 *
 * Only a literal string counts: an `environment` value may be a CloudFormation
 * intrinsic, which has no URL to print here. Trailing slashes go because the
 * route is appended to it.
 */
const configuredBaseOf = (server) => {
  const value = server.environment?.SERVERLESS_MCP_PUBLIC_BASE_URL
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed === '' ? undefined : trimmed
}

/**
 * Entries for the `mcp` service-output section.
 *
 * The section renderer (`lib/cli/write-service-outputs.js`) prints the section
 * name itself, so the entries carry no `mcp: ` prefix. It also prints an array
 * as an indented list under an `mcp:` header and a string inline, so rendering
 * a lone server as `mcp: crm → …` is up to the caller passing the single entry
 * on its own rather than wrapped in an array.
 *
 * The origin is resolved per server, because the override that wins is per
 * server: its own SERVERLESS_MCP_PUBLIC_BASE_URL first, then `publicBaseUrl`,
 * then the stack output. A custom domain wins over the stack output for the same
 * reason the override wins over both - it is the URL clients are handed, and
 * under `provider.apiGateway.disableDefaultEndpoint` the execute-api URL does
 * not answer at all. `publicBaseUrl` is derived in `./packaging.js`, the same
 * value the entry is given as SERVERLESS_MCP_PUBLIC_BASE_URL, so the summary and
 * the deployed server cannot disagree about the origin.
 *
 * A server with no origin at all is left out on its own: one service can hold
 * both a server that names its own URL and one that has none to print.
 */
export const formatMcpEndpoints = ({
  servers,
  serviceEndpoint,
  publicBaseUrl,
}) => {
  const lines = []
  for (const server of servers) {
    const baseUrl = configuredBaseOf(server) ?? publicBaseUrl ?? serviceEndpoint
    if (!baseUrl) continue
    lines.push(`${server.name} → ${baseUrl}/${server.name}/mcp`)
  }
  return lines
}
