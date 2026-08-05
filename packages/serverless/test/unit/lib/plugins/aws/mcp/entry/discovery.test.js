import { describe, it, expect } from '@jest/globals'
import { protectedResourceMetadata } from '../../../../../../../lib/plugins/aws/mcp/entry/lib/discovery.mjs'

describe('protectedResourceMetadata', () => {
  const issuer = 'https://example.auth0.com/'

  it('derives the resource URL from the request and lists the issuer', () => {
    expect(
      protectedResourceMetadata({
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/.well-known/oauth-protected-resource/crm/mcp',
        issuer,
      }),
    ).toEqual({
      status: 200,
      // Browser-based MCP clients fetch this document cross-origin, and the
      // SDK's own oauthMetadata middleware sends the same header. The MCP tool
      // routes stay CORS-less on purpose — this is metadata only.
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: {
        resource: 'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
      },
    })
  })

  it('yields the bare origin when the metadata path carries no resource suffix', () => {
    expect(
      protectedResourceMetadata({
        requestUrl:
          'https://mcp.example.com/.well-known/oauth-protected-resource',
        issuer,
      }).body.resource,
    ).toBe('https://mcp.example.com')
  })

  // The entry builds `requestUrl` from the forwarded scheme, so an
  // `x-forwarded-proto: https` request must not report an http resource.
  it('honours the scheme of the request URL', () => {
    expect(
      protectedResourceMetadata({
        requestUrl:
          'https://mcp.example.com/.well-known/oauth-protected-resource/crm/mcp',
        issuer,
      }).body.resource,
    ).toBe('https://mcp.example.com/crm/mcp')
    expect(
      protectedResourceMetadata({
        requestUrl:
          'http://localhost:3000/.well-known/oauth-protected-resource/crm/mcp',
        issuer,
      }).body.resource,
    ).toBe('http://localhost:3000/crm/mcp')
  })

  it('ignores the query string of the metadata request', () => {
    expect(
      protectedResourceMetadata({
        requestUrl:
          'https://mcp.example.com/.well-known/oauth-protected-resource/crm/mcp?foo=bar',
        issuer,
      }).body.resource,
    ).toBe('https://mcp.example.com/crm/mcp')
  })

  // On a raw execute-api endpoint the metadata route really lives under the
  // stage, because that is where the whole app lives — clients reach it through
  // the `resource_metadata` URL of the 401 challenge and fetch it verbatim. The
  // stage prefix belongs at the front of the resource path.
  it('moves a stage prefix from before the well-known segment into the resource', () => {
    expect(
      protectedResourceMetadata({
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/dev/.well-known/oauth-protected-resource/crm/mcp',
        issuer,
      }).body.resource,
    ).toBe('https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp')
  })

  it('reconstructs a multi-segment base-path prefix', () => {
    expect(
      protectedResourceMetadata({
        requestUrl:
          'https://mcp.example.com/api/v2/.well-known/oauth-protected-resource/crm/mcp',
        issuer,
      }).body.resource,
    ).toBe('https://mcp.example.com/api/v2/crm/mcp')
  })

  // The segment has to end on a path boundary, or a resource named after it
  // would be mistaken for the metadata route itself.
  it('throws on a segment that merely starts with the metadata segment', () => {
    expect(() =>
      protectedResourceMetadata({
        requestUrl:
          'https://mcp.example.com/.well-known/oauth-protected-resource-x/crm/mcp',
        issuer,
      }),
    ).toThrow(/client-facing absolute URL/)
  })

  // The segment has to begin on a path boundary too, or the tail of a longer
  // segment would be read as the metadata route and truncate the prefix.
  it('throws on a segment that merely ends with the metadata segment', () => {
    expect(() =>
      protectedResourceMetadata({
        requestUrl:
          'https://mcp.example.com/not.well-known/oauth-protected-resource/crm/mcp',
        issuer,
      }),
    ).toThrow(/client-facing absolute URL/)
  })

  it('names the offending URL in the error', () => {
    expect(() =>
      protectedResourceMetadata({
        requestUrl: 'https://mcp.example.com/crm/mcp',
        issuer,
      }),
    ).toThrow(/https:\/\/mcp\.example\.com\/crm\/mcp/)
  })
})
