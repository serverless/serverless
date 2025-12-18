import AWS from 'aws-sdk'

export default class Globals {
  static pluginName = 'domains'

  static serverless
  static options
  static v3Utils

  static currentRegion
  static credentials

  static defaultRegion = 'us-east-1'
  static defaultBasePath = '(none)'
  static defaultStage = '$default'

  // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html
  static reservedBasePaths = ['ping', 'sping']

  static endpointTypes = {
    edge: 'EDGE',
    regional: 'REGIONAL',
  }

  static apiTypes = {
    http: 'HTTP',
    rest: 'REST',
    websocket: 'WEBSOCKET',
  }

  static gatewayAPIIdKeys = {
    [Globals.apiTypes.rest]: 'restApiId',
    [Globals.apiTypes.websocket]: 'websocketApiId',
  }

  // Cloud Formation Resource Ids
  static CFResourceIds = {
    [Globals.apiTypes.http]: 'HttpApi',
    [Globals.apiTypes.rest]: 'ApiGatewayRestApi',
    [Globals.apiTypes.websocket]: 'WebsocketsApi',
  }

  // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html
  static CFFuncNames = {
    fnImport: 'Fn::ImportValue',
    ref: 'Ref',
  }

  /* eslint camelcase: ["error", {allow: ["^tls_"]}] */
  static tlsVersions = {
    tls_1_0: 'TLS_1_0',
    tls_1_2: 'TLS_1_2',
    tls_1_3: 'TLS_1_3',
  }

  static routingPolicies = {
    simple: 'simple',
    latency: 'latency',
    weighted: 'weighted',
  }

  static getBaseStage() {
    return Globals.options.stage || Globals.serverless.service.provider.stage
  }

  static getServiceEndpoint(service) {
    if (Globals.serverless.providers.aws.sdk) {
      const serviceConf = Globals.serverless.providers.aws.sdk.config[service]
      if (serviceConf) {
        return serviceConf.endpoint
      }
      return null
    }
    return null
  }

  static getRegion() {
    const slsRegion =
      Globals.options.region || Globals.serverless.service.provider.region
    return slsRegion || Globals.currentRegion || Globals.defaultRegion
  }

  static async getProfileCreds(profile) {
    const credentials = new AWS.SharedIniFileCredentials({ profile })
    return credentials
  }

  static getRetryStrategy(attempts = 5, delay = 3000, backoff = 500) {
    return {
      retryDelayOptions: {
        base: backoff,
        customBackoff: (retryCount) => backoff + retryCount * delay,
      },
      maxRetries: attempts,
    }
  }

  static getRequestHandler() {
    // AWS SDK v2 handles proxy configuration automatically
    return {}
  }
}
