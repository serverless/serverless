import path from 'path'
import { MappingTemplate } from './MappingTemplate.js'
import { SyncConfig } from './SyncConfig.js'
import { JsResolver } from './JsResolver.js'

export class PipelineFunction {
  constructor(api, config) {
    this.api = api
    this.config = config
  }

  compile() {
    const { dataSource, code } = this.config
    if (!this.api.hasDataSource(dataSource)) {
      throw new this.api.plugin.serverless.classes.Error(
        `Pipeline Function '${this.config.name}' references unknown DataSource '${dataSource}'`,
      )
    }

    const logicalId = this.api.naming.getPipelineFunctionLogicalId(
      this.config.name,
    )
    const logicalIdDataSource = this.api.naming.getDataSourceLogicalId(
      this.config.dataSource,
    )

    const Properties = {
      ApiId: this.api.getApiId(),
      Name: this.config.name,
      DataSourceName: { 'Fn::GetAtt': [logicalIdDataSource, 'Name'] },
      Description: this.config.description,
      FunctionVersion: '2018-05-29',
      MaxBatchSize: this.config.maxBatchSize,
    }

    if (code) {
      Properties.Code = this.resolveJsCode(code)
      Properties.Runtime = {
        Name: 'APPSYNC_JS',
        RuntimeVersion: '1.0.0',
      }
    } else {
      const requestMappingTemplates = this.resolveMappingTemplate('request')
      if (requestMappingTemplates) {
        Properties.RequestMappingTemplate = requestMappingTemplates
      }

      const responseMappingTemplate = this.resolveMappingTemplate('response')
      if (responseMappingTemplate) {
        Properties.ResponseMappingTemplate = responseMappingTemplate
      }
    }

    if (this.config.sync) {
      const asyncConfig = new SyncConfig(this.api, this.config)
      Properties.SyncConfig = asyncConfig.compile()
    }

    return {
      [logicalId]: {
        Type: 'AWS::AppSync::FunctionConfiguration',
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
