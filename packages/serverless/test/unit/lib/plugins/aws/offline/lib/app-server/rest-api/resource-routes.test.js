import { parseResources } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/resource-routes.js'

describe('parseResources', () => {
  it('returns {} when resources is undefined', () => {
    expect(parseResources(undefined)).toEqual({})
  })

  it('returns {} when Resources is missing', () => {
    expect(parseResources({})).toEqual({})
  })

  it('returns {} when Resources is empty', () => {
    expect(parseResources({ Resources: {} })).toEqual({})
  })

  it('returns {} when there are no Method or Resource entries', () => {
    expect(
      parseResources({
        Resources: {
          MyTable: { Type: 'AWS::DynamoDB::Table', Properties: {} },
        },
      }),
    ).toEqual({})
  })

  it('reconstructs a 2-segment path with Fn::GetAtt root parent', () => {
    // /public/{proxy+}
    // ApiGatewayResourcePublic  parent = Fn::GetAtt [ApiGatewayRestApi, RootResourceId]
    // ApiGatewayResourceProxy   parent = Ref ApiGatewayResourcePublic
    const resources = {
      Resources: {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi', Properties: {} },
        ApiGatewayResourcePublic: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'public',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayResourceProxy: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: '{proxy+}',
            ParentId: { Ref: 'ApiGatewayResourcePublic' },
          },
        },
        ApiGatewayMethodProxyGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceProxy' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/{proxy}',
            },
          },
        },
      },
    }

    expect(parseResources(resources)).toEqual({
      ApiGatewayMethodProxyGet: {
        isProxy: true,
        method: 'GET',
        pathResource: '/public/{proxy+}',
        proxyUri: 'https://example.com/{proxy}',
      },
    })
  })

  it('resolves parent via { Ref } correctly', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceUsers: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'users',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodUsersGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceUsers' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://backend.example.com/users',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodUsersGet.pathResource).toBe('/users')
  })

  it('resolves parent via { Fn::GetAtt } correctly (root resolution)', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceItems: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'items',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodItemsGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'ANY',
            ResourceId: { Ref: 'ApiGatewayResourceItems' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://backend.example.com/items',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodItemsGet.pathResource).toBe('/items')
    expect(result.ApiGatewayMethodItemsGet.method).toBe('ANY')
  })

  it('sets isProxy true and proxyUri for HTTP_PROXY integration', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceFoo: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'foo',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodFooPost: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'POST',
            ResourceId: { Ref: 'ApiGatewayResourceFoo' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/foo',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodFooPost).toEqual({
      isProxy: true,
      method: 'POST',
      pathResource: '/foo',
      proxyUri: 'https://example.com/foo',
    })
  })

  it('sets isProxy false and proxyUri undefined for HTTP (non-proxy) integration', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceBar: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'bar',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodBarGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceBar' },
            Integration: {
              Type: 'HTTP',
              Uri: 'https://example.com/bar',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodBarGet).toEqual({
      isProxy: false,
      method: 'GET',
      pathResource: '/bar',
      proxyUri: undefined,
    })
  })

  it('sets isProxy false and proxyUri undefined for MOCK integration', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceMock: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'mock',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodMockGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceMock' },
            Integration: {
              Type: 'MOCK',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodMockGet).toEqual({
      isProxy: false,
      method: 'GET',
      pathResource: '/mock',
      proxyUri: undefined,
    })
  })

  it('returns {} entry for a method with unresolvable path (missing PathPart)', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceMissingPart: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            // PathPart intentionally omitted
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodMissingGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceMissingPart' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/missing',
            },
          },
        },
      },
    }

    expect(parseResources(resources)).toEqual({
      ApiGatewayMethodMissingGet: {},
    })
  })

  it('carries through the HttpMethod value', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceOrders: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'orders',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodOrdersDelete: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'DELETE',
            ResourceId: { Ref: 'ApiGatewayResourceOrders' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/orders',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodOrdersDelete.method).toBe('DELETE')
  })
})
