import { jest } from '@jest/globals'
import * as given from './given.js'

const plugin = given.plugin()

describe('variable', () => {
  it('should resolve the api id', () => {
    expect(
      plugin.resolveVariable({
        address: 'id',
        options: {},
        resolveVariable: () => '',
      }),
    ).toMatchInlineSnapshot(`
      {
        "value": {
          "Fn::GetAtt": [
            "GraphQlApi",
            "ApiId",
          ],
        },
      }
    `)
  })

  it('should resolve the api url', () => {
    expect(
      plugin.resolveVariable({
        address: 'url',
        options: {},
        resolveVariable: () => '',
      }),
    ).toMatchInlineSnapshot(`
      {
        "value": {
          "Fn::GetAtt": [
            "GraphQlApi",
            "GraphQLUrl",
          ],
        },
      }
    `)
  })

  it('should resolve the api arn', () => {
    expect(
      plugin.resolveVariable({
        address: 'arn',
        options: {},
        resolveVariable: () => '',
      }),
    ).toMatchInlineSnapshot(`
      {
        "value": {
          "Fn::GetAtt": [
            "GraphQlApi",
            "Arn",
          ],
        },
      }
    `)
  })

  it('should resolve an api key', () => {
    expect(
      plugin.resolveVariable({
        address: 'apiKey.foo',
        options: {},
        resolveVariable: () => '',
      }),
    ).toMatchInlineSnapshot(`
      {
        "value": {
          "Fn::GetAtt": [
            "GraphQlApifoo",
            "ApiKey",
          ],
        },
      }
    `)
  })
})

describe('gatherData', () => {
  it('paginates API keys', async () => {
    const appsyncPlugin = given.plugin()
    appsyncPlugin.getApiIdFromStack = jest.fn().mockResolvedValue('api-id')
    appsyncPlugin.provider.request = jest
      .fn()
      .mockResolvedValueOnce({ graphqlApi: {} })
      .mockResolvedValueOnce({
        apiKeys: [{ id: 'key-1' }],
        nextToken: 'page-2',
      })
      .mockResolvedValueOnce({ apiKeys: [{ id: 'key-2' }] })

    await appsyncPlugin.gatherData()

    expect(appsyncPlugin.gatheredData.apiKeys).toEqual([
      { value: 'key-1', description: undefined },
      { value: 'key-2', description: undefined },
    ])
    expect(appsyncPlugin.provider.request).toHaveBeenNthCalledWith(
      2,
      'AppSync',
      'listApiKeys',
      { apiId: 'api-id' },
    )
    expect(appsyncPlugin.provider.request).toHaveBeenNthCalledWith(
      3,
      'AppSync',
      'listApiKeys',
      { apiId: 'api-id', nextToken: 'page-2' },
    )
  })
})
