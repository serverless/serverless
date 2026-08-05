// Descriptors are pre-normalized to what the api-gateway compiler expects
// downstream of its own event normalization: a slash-free lowercase `path`, a
// lowercase `method`, and an uppercase `transferMode`.
const streamingHttp = (path, method, timeout) => ({
  path,
  method,
  integration: 'AWS_PROXY',
  timeoutInMillis: timeout * 1000,
  response: { transferMode: 'STREAM' },
})

export const buildRouteDescriptors = ({ servers }) => {
  const events = []
  for (const s of servers) {
    const mcpRoute = streamingHttp(`${s.name}/mcp`, 'any', s.timeout)
    if (s.auth?.authorizer) {
      mcpRoute.authorizer = { name: s.auth.authorizer }
    }
    events.push({ functionName: s.name, http: mcpRoute })

    // The OAuth protected-resource metadata document must stay reachable
    // without a token, so it never carries the authorizer.
    if (s.auth) {
      events.push({
        functionName: s.name,
        http: streamingHttp(
          `.well-known/oauth-protected-resource/${s.name}/mcp`,
          'get',
          s.timeout,
        ),
      })
    }
  }
  return events
}
