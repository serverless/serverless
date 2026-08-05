// Runs inside the user's Lambda: no framework imports, no AWS SDK, plain Errors.
// RFC 9728 protected-resource metadata. The resource URL is derived from the
// incoming request so the document needs no knowledge of the stack.
//
// CONTRACT: `requestUrl` MUST be the client-facing absolute URL of the metadata
// request — the forwarded scheme already applied, and any stage or base-path
// prefix left intact — because the composition layer, not this module, owns URL
// reconstruction. The URL that Hono's aws-lambda adapter builds is NOT that URL
// on a REST API: it derives the path from `event.path` (no stage prefix) and
// hardcodes the scheme.
//
// RFC 9728 forms the metadata URL by inserting `/.well-known/
// oauth-protected-resource` between the resource's host and its path, so we
// recover the resource by reading that rule in reverse: drop the segment and
// rejoin what surrounded it. The insertion happens relative to wherever the app
// is mounted, not necessarily the origin root — on a raw execute-api endpoint
// the app lives under the stage, so the real metadata route is
// `/<stage>/.well-known/oauth-protected-resource/<name>/mcp` and clients fetch
// exactly that, verbatim, from the `resource_metadata` URL of the 401
// challenge. The prefix that precedes the segment therefore belongs at the
// front of the resource path and the suffix at the back. A URL with no such
// segment at all is the caller passing the wrong URL, and we say so rather than
// emitting a resource identifier that clients will reject.
//
// Exported because `./compose.mjs` decides which requests reach this module and
// has to recognize exactly the segment this one strips back out.
export const metadataSegment =
  /(?:^|\/)\.well-known\/oauth-protected-resource(?=\/|$)/

export const protectedResourceMetadata = ({ requestUrl, issuer }) => {
  const url = new URL(requestUrl)
  const match = metadataSegment.exec(url.pathname)
  if (!match) {
    throw new Error(
      `protectedResourceMetadata() expects the client-facing absolute URL of a protected-resource metadata request — a URL whose path contains "/.well-known/oauth-protected-resource" as a whole path segment — and got "${requestUrl}". Reconstruct the URL before calling: apply the forwarded scheme and keep any stage or base-path prefix intact.`,
    )
  }
  const resource = `${url.protocol}//${url.host}${url.pathname.slice(
    0,
    match.index,
  )}${url.pathname.slice(match.index + match[0].length)}`
  return {
    status: 200,
    // Browser-based MCP clients fetch this document cross-origin, and the SDK's
    // own oauthMetadata middleware sends the same header. The MCP tool routes
    // stay CORS-less on purpose — this is metadata only.
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
    body: {
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
    },
  }
}
