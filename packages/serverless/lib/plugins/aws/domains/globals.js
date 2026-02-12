import { fromIni } from '@aws-sdk/credential-providers'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

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

  static accessModes = {
    basic: 'BASIC',
    strict: 'STRICT',
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
  // Valid legacy values per AWS API docs: TLS_1_0, TLS_1_2
  // TLS 1.3 is only available through enhanced SecurityPolicy_* values
  static tlsVersions = {
    tls_1_0: 'TLS_1_0',
    tls_1_2: 'TLS_1_2',
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
    return Globals.currentRegion || Globals.defaultRegion
  }

  /**
   * Get credentials for a specific AWS profile using AWS SDK V3
   * @param {string} profile - The AWS profile name
   * @returns {Promise<object>} - The resolved credentials
   */
  static async getProfileCreds(profile) {
    return fromIni({ profile })()
  }

  /**
   * Get retry strategy for AWS SDK V3 clients
   * @param {number} attempts - Maximum retry attempts (default: 5)
   * @param {number} delay - Delay in ms per attempt (default: 3000)
   * @param {number} backoff - Base backoff in ms (default: 500)
   * @returns {ConfiguredRetryStrategy} - The retry strategy instance
   */
  static getRetryStrategy(attempts = 5, delay = 3000, backoff = 500) {
    return new ConfiguredRetryStrategy(
      attempts,
      // Backoff function: base backoff + delay per attempt
      (attempt) => backoff + attempt * delay,
    )
  }
}
