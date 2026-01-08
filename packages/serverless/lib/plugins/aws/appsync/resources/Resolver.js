import path from 'path'
import { MappingTemplate } from './MappingTemplate.js'
import { SyncConfig } from './SyncConfig.js'
import { JsResolver } from './JsResolver.js'

// A decent default for pipeline JS resolvers
const DEFAULT_JS_RESOLVERS = `
export function request() {
  return {};
}

export function response(ctx) {
  return ctx.prev.result;
}
`

export class Resolver {
  constructor(api, config) {
    this.api = api
    this.config = config
  }

  compile() {
    let Properties = {
      ApiId: this.api.getApiId(),
      TypeName: this.config.type,
      FieldName: this.config.field,
    }

    const isVTLResolver = 'request' in this.config || 'response' in this.config
    const isJsResolver =
      'code' in this.config || (!isVTLResolver && this.config.kind !== 'UNIT')

    if (isJsResolver) {
      if (this.config.code) {
        Properties.Code = this.resolveJsCode(this.config.code)
      } else {
        // default for pipeline JS resolvers
        Properties.Code = DEFAULT_JS_RESOLVERS
      }
      Properties.Runtime = {
        Name: 'APPSYNC_JS',
        RuntimeVersion: '1.0.0',
      }
    } else if (isVTLResolver) {
      const requestMappingTemplates = this.resolveMappingTemplate('request')
      if (requestMappingTemplates) {
        Properties.RequestMappingTemplate = requestMappingTemplates
      }

      const responseMappingTemplate = this.resolveMappingTemplate('response')
      if (responseMappingTemplate) {
        Properties.ResponseMappingTemplate = responseMappingTemplate
      }
    }

    if (this.config.caching) {
      if (this.config.caching === true) {
        // Use defaults
        Properties.CachingConfig = {
          Ttl: this.api.config.caching?.ttl || 3600,
        }
      } else if (typeof this.config.caching === 'object') {
        Properties.CachingConfig = {
          CachingKeys: this.config.caching.keys,
          Ttl: this.config.caching.ttl || this.api.config.caching?.ttl || 3600,
        }
      }
    }

    if (this.config.sync) {
      const asyncConfig = new SyncConfig(this.api, this.config)
      Properties.SyncConfig = asyncConfig.compile()
    }

    if (this.config.kind === 'UNIT') {
      const { dataSource } = this.config
      if (!this.api.hasDataSource(dataSource)) {
        throw new this.api.plugin.serverless.classes.Error(
          `Resolver '${this.config.type}.${this.config.field}' references unknown DataSource '${dataSource}'`,
        )
      }

      const logicalIdDataSource =
        this.api.naming.getDataSourceLogicalId(dataSource)
      Properties = {
        ...Properties,
        Kind: 'UNIT',
        DataSourceName: { 'Fn::GetAtt': [logicalIdDataSource, 'Name'] },
        MaxBatchSize: this.config.maxBatchSize,
      }
    } else {
      Properties = {
        ...Properties,
        Kind: 'PIPELINE',
        PipelineConfig: {
          Functions: this.config.functions.map((name) => {
            if (!this.api.hasPipelineFunction(name)) {
              throw new this.api.plugin.serverless.classes.Error(
                `Resolver '${this.config.type}.${this.config.field}' references unknown Pipeline function '${name}'`,
              )
            }

            const logicalIdDataSource =
              this.api.naming.getPipelineFunctionLogicalId(name)
            return { 'Fn::GetAtt': [logicalIdDataSource, 'FunctionId'] }
          }),
        },
      }
    }

    const logicalIdResolver = this.api.naming.getResolverLogicalId(
      this.config.type,
      this.config.field,
    )
    const logicalIdGraphQLSchema = this.api.naming.getSchemaLogicalId()

    return {
      [logicalIdResolver]: {
        Type: 'AWS::AppSync::Resolver',
        DependsOn: [logicalIdGraphQLSchema],
        Properties,
      },
    }
  }

  resolveJsCode(filePath) {
    const codePath = path.join(
      this.api.plugin.serverless.config.servicePath,
      filePath,
    )

    const template = new JsResolver(this.api, {
      path: codePath,
      substitutions: this.config.substitutions,
    })

    return template.compile()
  }

  resolveMappingTemplate(type) {
    const templateName = this.config[type]

    if (templateName) {
      const templatePath = path.join(
        this.api.plugin.serverless.config.servicePath,
        templateName,
      )
      const template = new MappingTemplate(this.api, {
        path: templatePath,
        substitutions: this.config.substitutions,
      })

      return template.compile()
    }
  }
}
