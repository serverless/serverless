/**
 * Wrapper class for Custom Domain information
 */

import DomainInfo from './domain-info.js'
import Globals from '../globals.js'
import { evaluateBoolean } from '../utils.js'
import ApiGatewayMap from './api-gateway-map.js'
import Logging from '../logging.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

class DomainConfig {
  constructor(config) {
    this.enabled = evaluateBoolean(config.enabled, true)
    this.hasSecurityPolicyConfigured = config.securityPolicy !== undefined
    this.hasAccessModeConfigured = config.accessMode !== undefined
    this.givenDomainName = config.name || config.domainName
    this.certificateArn = config.certificateArn
    this.certificateName = config.certificateName
    this.createRoute53Record = evaluateBoolean(config.createRoute53Record, true)
    this.createRoute53IPv6Record = evaluateBoolean(
      config.createRoute53IPv6Record,
      true,
    )
    this.route53Profile = config.route53Profile
    this.route53Region = config.route53Region
    this.hostedZoneId = config.hostedZoneId
    this.hostedZonePrivate = config.hostedZonePrivate
    this.allowPathMatching = config.allowPathMatching
    this.autoDomain = evaluateBoolean(config.autoDomain, true)
    this.autoDomainWaitFor = config.autoDomainWaitFor
    this.preserveExternalPathMappings = evaluateBoolean(
      config.preserveExternalPathMappings,
      false,
    )
    this.basePath = DomainConfig._getBasePath(config.basePath)
    this.apiType = DomainConfig._getApiType(config.apiType)
    // apiType and basePath should be defined before stage
    this.stage = DomainConfig._getStage(
      config.stage,
      this.apiType,
      this.basePath,
    )
    this.endpointType = DomainConfig._getEndpointType(config.endpointType)
    this.tlsTruststoreUri = DomainConfig._getTLSTruststoreUri(
      config.tlsTruststoreUri,
      this.endpointType,
    )
    this.tlsTruststoreVersion = config.tlsTruststoreVersion
    this.securityPolicy = DomainConfig._getSecurityPolicy(config.securityPolicy)
    this.accessMode = DomainConfig._getAccessMode(config.accessMode)
    this.route53Params = DomainConfig._getRoute53Params(
      config.route53Params,
      this.endpointType,
    )
    this.splitHorizonDns =
      !this.hostedZoneId &&
      !this.hostedZonePrivate &&
      evaluateBoolean(config.splitHorizonDns, false)
  }

  static _getStage(stage, apiType, basePath) {
    if (
      apiType === Globals.apiTypes.http &&
      (basePath === Globals.defaultBasePath || !stage)
    ) {
      return Globals.defaultStage
    }
    return stage || Globals.getBaseStage()
  }

  static _getBasePath(basePath) {
    if (!basePath || basePath.trim() === '') {
      basePath = Globals.defaultBasePath
    }

    // Normalize basePath by removing leading slash to work with AWS API Gateway
    if (basePath.startsWith('/')) {
      basePath = basePath.substring(1)
    }

    // Normalize basePath by removing trailing slash to work with AWS API Gateway
    if (basePath.endsWith('/')) {
      basePath = basePath.slice(0, -1)
    }

    if (Globals.reservedBasePaths.indexOf(basePath) !== -1) {
      Logging.logWarning(
        'The `/ping` and `/sping` paths are reserved for the service health check.\n Please take a look at' +
          'https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html',
      )
    }
    return basePath
  }

  static _getEndpointType(endpointType) {
    const endpointTypeWithDefault =
      endpointType || Globals.endpointTypes.regional
    const endpointTypeToUse =
      Globals.endpointTypes[endpointTypeWithDefault.toLowerCase()]
    if (!endpointTypeToUse) {
      throw new ServerlessError(
        `${endpointTypeWithDefault} is not supported endpointType, use EDGE or REGIONAL.`,
        ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_ENDPOINT_TYPE,
      )
    }
    return endpointTypeToUse
  }

  static _getApiType(apiType) {
    if (!apiType) {
      throw new ServerlessError(
        'API type is required but was not provided. This should be automatically detected from CloudFormation template.',
        ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_API_TYPE,
      )
    }

    const apiTypeToUse = Globals.apiTypes[apiType.toLowerCase()]
    if (!apiTypeToUse) {
      throw new ServerlessError(
        `${apiType} is not supported api type, use REST, HTTP or WEBSOCKET.`,
        ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_API_TYPE,
      )
    }
    return apiTypeToUse
  }

  static _getTLSTruststoreUri(tlsTruststoreUri, endpointType) {
    if (tlsTruststoreUri) {
      if (endpointType === Globals.endpointTypes.edge) {
        throw new ServerlessError(
          endpointType +
            ' APIs do not support mutual TLS, ' +
            'remove tlsTruststoreUri or change to a regional API.',
          ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_TLS_TRUSTSTORE_URI,
        )
      }

      const { protocol, pathname } = new URL(tlsTruststoreUri)

      if (protocol !== 's3:' && !pathname.substring(1).includes('/')) {
        throw new ServerlessError(
          `${tlsTruststoreUri} is not a valid s3 uri, try something like s3://bucket-name/key-name.`,
          ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_TLS_TRUSTSTORE_URI,
        )
      }
    }

    return tlsTruststoreUri
  }

  static _getSecurityPolicy(securityPolicy) {
    const securityPolicyDefault = securityPolicy || Globals.tlsVersions.tls_1_2

    // Enhanced security policies (e.g., SecurityPolicy_TLS13_2025_EDGE) are passed through directly
    // See: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies.html
    if (securityPolicyDefault.startsWith('SecurityPolicy_')) {
      return securityPolicyDefault
    }

    // Legacy shorthand support (tls_1_0, tls_1_2)
    const tlsVersionToUse =
      Globals.tlsVersions[securityPolicyDefault.toLowerCase()]
    if (!tlsVersionToUse) {
      throw new ServerlessError(
        `${securityPolicyDefault} is not a supported securityPolicy. ` +
          'Use tls_1_0, tls_1_2, or an enhanced policy (e.g., SecurityPolicy_TLS13_2025_EDGE).',
        ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_SECURITY_POLICY,
      )
    }

    return tlsVersionToUse
  }

  static _getAccessMode(accessMode) {
    if (!accessMode) {
      return undefined
    }

    const accessModeToUse = Globals.accessModes[accessMode.toLowerCase()]
    if (!accessModeToUse) {
      throw new ServerlessError(
        `${accessMode} is not a supported accessMode, use BASIC or STRICT.`,
        ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_ACCESS_MODE,
      )
    }

    return accessModeToUse
  }

  static _getRoute53Params(route53Params, endpointType) {
    const routingPolicy =
      route53Params?.routingPolicy?.toLowerCase() ??
      Globals.routingPolicies.simple
    const routingPolicyToUse = Globals.routingPolicies[routingPolicy]
    if (!routingPolicyToUse) {
      throw new ServerlessError(
        `${routingPolicy} is not a supported routing policy, use simple, latency, or weighted.`,
        ServerlessErrorCodes.domains.DOMAIN_CONFIG_INVALID_ROUTING_POLICY,
      )
    }

    if (
      routingPolicyToUse !== Globals.routingPolicies.simple &&
      endpointType === Globals.endpointTypes.edge
    ) {
      throw new ServerlessError(
        `${routingPolicy} routing is not intended to be used with edge endpoints. ` +
          'Use a regional endpoint instead.',
        ServerlessErrorCodes.domains
          .DOMAIN_CONFIG_ROUTING_POLICY_EDGE_INCOMPATIBLE,
      )
    }

    return {
      routingPolicy: routingPolicyToUse,
      setIdentifier: route53Params?.setIdentifier,
      weight: route53Params?.weight ?? 200,
      healthCheckId: route53Params?.healthCheckId,
    }
  }
}

export default DomainConfig
