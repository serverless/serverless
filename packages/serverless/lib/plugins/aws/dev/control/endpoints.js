/**
 * The service's endpoints for `dev status --json` (`endpointsOf`) and, from the endpoints `deploy`
 * and `info` print, for the start-up lines and the `dev status` text (`endpointListsOf`).
 *
 * `endpointsOf`: each `http` (REST API) and `httpApi` (HTTP API) event and each function URL,
 * with the URL the stack's outputs give (`ServiceEndpoint`, read as the MCP plugin reads it;
 * `HttpApiUrl`, or for an HTTP API `provider.httpApi.id` names the URL `info` looks up; the
 * function URL output the info plugin reads), then each MCP server at the URL `deploy` and `info` print for it. An
 * endpoint whose output is missing (a stage deployed by an older configuration, a custom output)
 * is left out rather than guessed.
 */
import {
  formatMcpEndpoints,
  mcpServerUrls,
  serviceEndpointOf,
} from '../../mcp/lib/endpoints.js'
import {
  endpointLinesOfEntries,
  stackEndpointEntriesOf,
} from '../../info/endpoints.js'

const outputOf = (outputs, key) =>
  outputs.find((output) => output.OutputKey === key)?.OutputValue

const joinUrl = (base, route) =>
  `${String(base).replace(/\/+$/, '')}/${String(route ?? '').replace(/^\/+/, '')}`

const restRouteOf = (event) => {
  if (typeof event === 'string') {
    const [method, route] = event.trim().split(/\s+/)
    return { method, route }
  }
  return { method: event?.method, route: event?.path }
}

const httpApiRouteOf = (event) => {
  if (event === '*') return { method: '*', route: '*' }
  if (typeof event === 'string') {
    const [method, route] = event.trim().split(/\s+/)
    return { method, route }
  }
  return { method: event?.method ?? '*', route: event?.path ?? '*' }
}

const methodOf = (method) =>
  !method || method === '*' ? 'ANY' : String(method).toUpperCase()

/**
 * `service` is `serverless.service`; `outputs` the stack's `Outputs` (`[{ OutputKey, OutputValue
 * }]`); `naming` the provider's naming (for the function URL output's key); `mcpServers` the
 * servers the mcp plugin validated; `externalHttpApiEndpoint` the URL of the HTTP API
 * `provider.httpApi.id` names (`externalHttpApiEndpointOf`), if any. Returns `[{ method, url, function }]`, an MCP server's entry
 * with `mcp: true` (its route takes any method).
 */
export const endpointsOf = ({
  service,
  outputs = [],
  naming,
  mcpServers = [],
  externalHttpApiEndpoint,
}) => {
  const restBase = serviceEndpointOf(outputs)
  const httpApiBase = outputOf(outputs, 'HttpApiUrl') ?? externalHttpApiEndpoint
  const endpoints = []
  for (const key of service.getAllFunctions()) {
    const config = service.getFunction(key) ?? {}
    for (const event of config.events ?? []) {
      if (event?.http !== undefined && restBase) {
        const { method, route } = restRouteOf(event.http)
        if (route !== undefined) {
          endpoints.push({
            method: methodOf(method),
            url: joinUrl(restBase, route),
            function: key,
          })
        }
      }
      if (event?.httpApi !== undefined && httpApiBase) {
        const { method, route } = httpApiRouteOf(event.httpApi)
        endpoints.push({
          method: methodOf(method),
          url: route === '*' ? httpApiBase : joinUrl(httpApiBase, route),
          function: key,
        })
      }
    }
    if (config.url) {
      const url = outputOf(
        outputs,
        naming?.getLambdaFunctionUrlOutputLogicalId?.(key),
      )
      if (url) endpoints.push({ method: 'ANY', url, function: key })
    }
  }
  for (const { name, url } of mcpServerUrls({
    servers: mcpServers,
    outputs,
    provider: service.provider,
  })) {
    endpoints.push({ method: 'ANY', url, function: name, mcp: true })
  }
  return endpoints
}

/**
 * The label the start-up lines and the `dev status` text give an endpoint entry
 * (`endpointEntriesOf`, `../../info/endpoints.js`): `METHOD /path` for a route, `CloudFront`, the
 * function's name for a function URL, `WebSocket` for a WebSocket API, and none for another URL.
 */
export const endpointLabelOf = (entry) => {
  if (entry.kind === 'route') return `${entry.method} ${entry.path}`
  if (entry.kind === 'cloudfront') return 'CloudFront'
  if (entry.name !== undefined) return entry.name
  return /^wss?:\/\//i.test(entry.url) ? 'WebSocket' : ''
}

/**
 * The endpoints `serverless deploy` and `serverless info` print, from the same stack outputs, in
 * two forms. `rows`, for the start-up lines and the `dev status` text (`endpointLines`,
 * `../attach/output.js`): `endpoints`, `[{ label, url }]` (`endpointLabelOf`); `webAppUrls`, each
 * web app's real URL and the custom domains that serve it (`[{ name, url }]`); and `mcp`, the MCP
 * servers (`[{ name, url }]`). `text`, the lines `deploy` and `info` print (`{ endpoints, mcp }`,
 * strings): the session's status answers them as `endpoint_text`, the field earlier CLI versions
 * read for their `dev status` text, in the shape they read. `serverless` is the Framework
 * instance.
 */
export const endpointListsOf = ({
  serverless,
  outputs = [],
  naming,
  mcpServers = [],
  externalHttpApiEndpoint,
}) => {
  const entries = stackEndpointEntriesOf({
    serverless,
    outputs,
    naming,
    externalHttpApiEndpoint,
  })
  const mcp = mcpServerUrls({
    servers: mcpServers,
    outputs,
    provider: serverless.service.provider,
  }).map(({ name, url }) => ({ name, url }))
  return {
    rows: {
      endpoints: entries
        .filter((entry) => entry.kind !== 'webApp')
        .map((entry) => ({ label: endpointLabelOf(entry), url: entry.url })),
      webAppUrls: entries
        .filter((entry) => entry.kind === 'webApp')
        .map(({ name, url }) => ({ name, url })),
      mcp,
    },
    text: {
      endpoints: endpointLinesOfEntries(entries),
      mcp: formatMcpEndpoints(mcp),
    },
  }
}
