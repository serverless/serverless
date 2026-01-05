import { Api } from '../../../../../../lib/plugins/aws/appsync/resources/Api.js'
import { Schema } from '../../../../../../lib/plugins/aws/appsync/resources/Schema.js'
import * as given from './given.js'

const plugin = given.plugin()

describe('schema', () => {
  it('should generate a schema resource', () => {
    const api = new Api(
      given.appSyncConfig({
        schema: [
          'test/unit/lib/plugins/aws/appsync/fixtures/schemas/single/schema.graphql',
        ],
      }),
      plugin,
    )

    expect(api.compileSchema()).toMatchSnapshot()
  })

  it('should merge the schemas', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const schema = new Schema(api, [
      'test/unit/lib/plugins/aws/appsync/fixtures/schemas/multiple/schema.graphql',
      'test/unit/lib/plugins/aws/appsync/fixtures/schemas/multiple/user.graphql',
      'test/unit/lib/plugins/aws/appsync/fixtures/schemas/multiple/post.graphql',
    ])
    expect(schema.generateSchema()).toMatchSnapshot()
  })

  it('should merge glob schemas', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const schema = new Schema(api, [
      'test/unit/lib/plugins/aws/appsync/fixtures/schemas/multiple/*.graphql',
    ])
    expect(schema.generateSchema()).toMatchSnapshot()
  })

  it('should fail if schema is invalid', () => {
    const api = new Api(
      given.appSyncConfig({
        schema: [
          'test/unit/lib/plugins/aws/appsync/fixtures/schemas/multiple/schema.graphql',
          'test/unit/lib/plugins/aws/appsync/fixtures/schemas/multiple/user.graphql',
        ],
      }),
      plugin,
    )
    expect(() => api.compileSchema()).toThrowErrorMatchingSnapshot()
  })

  it('should return single files schemas as-is', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const schema = new Schema(api, [
      'test/unit/lib/plugins/aws/appsync/fixtures/schemas/single/schema.graphql',
    ])
    expect(schema.generateSchema()).toMatchSnapshot()
  })
})
