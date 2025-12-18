import { log } from '@serverless/util'
import compileRestApi from '../package/compile/events/api-gateway/lib/rest-api.js'
import compileResources from '../package/compile/events/api-gateway/lib/resources.js'
import compileCors from '../package/compile/events/api-gateway/lib/cors.js'
import compileDeployment from '../package/compile/events/api-gateway/lib/deployment.js'
import getStackInfo from '../info/get-stack-info.js'
import compileMethodsToKinesis from './package/kinesis/compileMethodsToKinesis.js'
import compileIamRoleToKinesis from './package/kinesis/compileIamRoleToKinesis.js'
import compileKinesisServiceProxy from './package/kinesis/compileKinesisServiceProxy.js'
import compileMethodsToSqs from './package/sqs/compileMethodsToSqs.js'
import compileIamRoleToSqs from './package/sqs/compileIamRoleToSqs.js'
import compileSqsServiceProxy from './package/sqs/compileSqsServiceProxy.js'
import compileMethodsToS3 from './package/s3/compileMethodsToS3.js'
import compileIamRoleToS3 from './package/s3/compileIamRoleToS3.js'
import compileS3ServiceProxy from './package/s3/compileS3ServiceProxy.js'
import compileMethodsToSns from './package/sns/compileMethodsToSns.js'
import compileIamRoleToSns from './package/sns/compileIamRoleToSns.js'
import compileSnsServiceProxy from './package/sns/compileSnsServiceProxy.js'
import compileMethodsToDynamodb from './package/dynamodb/compileMethodsToDynamodb.js'
import compileIamRoleToDynamodb from './package/dynamodb/compileIamRoleToDynamodb.js'
import compileDynamodbServiceProxy from './package/dynamodb/compileDynamodbServiceProxy.js'
import compileMethodsToEventBridge from './package/eventbridge/compileMethodsToEventBridge.js'
import compileIamRoleToEventBridge from './package/eventbridge/compileIamRoleToEventBridge.js'
import compileEventBridgeServiceProxy from './package/eventbridge/compileEventBridgeServiceProxy.js'
import validate from './api-gateway/validate.js'
import methods from './api-gateway/methods.js'
import utils from './utils.js'

const logger = log.get('sls:apigateway-service-proxy')

class ServerlessApigatewayServiceProxy {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.service = this.serverless.service.service
    this.region = this.provider.getRegion()
    this.stage = this.provider.getStage()
    this.apiGatewayMethodLogicalIds = []

    Object.assign(
      this,
      compileRestApi,
      compileResources,
      compileCors,
      compileDeployment,
      compileMethodsToKinesis,
      compileIamRoleToKinesis,
      compileKinesisServiceProxy,
      compileMethodsToSqs,
      compileIamRoleToSqs,
      compileSqsServiceProxy,
      compileMethodsToS3,
      compileIamRoleToS3,
      compileS3ServiceProxy,
      compileMethodsToSns,
      compileIamRoleToSns,
      compileSnsServiceProxy,
      compileMethodsToDynamodb,
      compileIamRoleToDynamodb,
      compileDynamodbServiceProxy,
      compileMethodsToEventBridge,
      compileIamRoleToEventBridge,
      compileEventBridgeServiceProxy,
      getStackInfo,
      validate,
      methods,
      utils,
    )

    this.hooks = {
      'package:compileEvents': async () => {
        if (!this.getAllServiceProxies().length) {
          return
        }

        this.validated = await this.validateServiceProxies()

        await this.compileRestApi()
        await this.compileResources()
        await this.compileCors()
        await this.compileKinesisServiceProxy()
        await this.compileSqsServiceProxy()
        await this.compileS3ServiceProxy()
        await this.compileSnsServiceProxy()
        await this.compileDynamodbServiceProxy()
        await this.compileEventBridgeServiceProxy()
        await this.mergeDeployment()
      },
      'after:deploy:deploy': async () => {
        if (!this.getAllServiceProxies().length) {
          return
        }

        await this.getStackInfo()
        this.display()
      },
    }
  }

  static shouldLoad({ serverless }) {
    const proxiesConfig = serverless?.service?.custom?.apiGatewayServiceProxies

    if (proxiesConfig === undefined || proxiesConfig === null) {
      return false
    }

    if (typeof proxiesConfig === 'boolean') {
      return proxiesConfig
    }

    return true
  }

  async mergeDeployment() {
    let exists = false
    const resources =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources

    Object.keys(resources).forEach((resource) => {
      if (resources[resource].Type === 'AWS::ApiGateway::Deployment') {
        exists = true
        resources[resource].DependsOn = resources[resource].DependsOn.concat(
          this.apiGatewayMethodLogicalIds,
        )
      }
    })

    if (!exists) {
      await this.compileDeployment()
    }
  }

  display() {
    const proxies = this.getAllServiceProxies()
    if (!proxies.length) {
      return ''
    }

    const endpointInfo = this.gatheredData?.info?.endpoints
    if (!endpointInfo) {
      return ''
    }

    const lines = proxies
      .map((serviceProxy) => {
        const serviceName = this.getServiceName(serviceProxy)
        const method = serviceProxy[serviceName].method.toUpperCase()
        let path = serviceProxy[serviceName].path
        path =
          path !== '/'
            ? `/${path
                .split('/')
                .filter((segment) => segment !== '')
                .join('/')}`
            : ''
        return `  ${method} - ${endpointInfo}${path}`
      })
      .join('\n')

    const message = [
      'Serverless API Gateway Service Proxy Outputs',
      'endpoints:',
      lines,
      '',
    ].join('\n')

    logger.notice(message)
    return message
  }
}

export default ServerlessApigatewayServiceProxy
