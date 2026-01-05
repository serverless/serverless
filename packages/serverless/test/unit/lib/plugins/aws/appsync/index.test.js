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
