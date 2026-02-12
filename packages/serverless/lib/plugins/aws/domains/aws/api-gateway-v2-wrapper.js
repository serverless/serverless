/**
 * Wrapper class for AWS APIGatewayV2 provider
 */
import {
  ApiGatewayV2Client,
  CreateDomainNameCommand,
  GetDomainNameCommand,
  DeleteDomainNameCommand,
  UpdateDomainNameCommand,
  CreateApiMappingCommand,
  GetApiMappingsCommand,
  UpdateApiMappingCommand,
  DeleteApiMappingCommand,
} from '@aws-sdk/client-apigatewayv2'
import { addProxyToAwsClient } from '@serverless/util'
import DomainInfo from '../models/domain-info.js'
import Globals from '../globals.js'
import ApiGatewayMap from '../models/api-gateway-map.js'
import APIGatewayBase from '../models/apigateway-base.js'
import Logging from '../logging.js'
import { getAWSPagedResults } from '../utils.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

class APIGatewayV2Wrapper extends APIGatewayBase {
  constructor(credentials) {
    super()
    const config = {
      region: Globals.getRegion(),
      endpoint: Globals.getServiceEndpoint('apigatewayv2'),
      retryStrategy: Globals.getRetryStrategy(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.apiGateway = addProxyToAwsClient(new ApiGatewayV2Client(config))
  }

  /**
   * Creates Custom Domain Name
   * @param {DomainConfig} domain
   * @returns {Promise<DomainInfo>}
   */
  async createCustomDomain(domain) {
    const providerTags = {
      ...Globals.serverless.service.provider.stackTags,
      ...Globals.serverless.service.provider.tags,
    }

    const params = {
      DomainName: domain.givenDomainName,
      DomainNameConfigurations: [
        {
          CertificateArn: domain.certificateArn,
          EndpointType: domain.endpointType,
          SecurityPolicy: domain.securityPolicy,
        },
      ],
      Tags: providerTags,
    }

    const isEdgeType = domain.endpointType === Globals.endpointTypes.edge
    if (!isEdgeType && domain.tlsTruststoreUri) {
      params.MutualTlsAuthentication = {
        TruststoreUri: domain.tlsTruststoreUri,
      }

      if (domain.tlsTruststoreVersion) {
        params.MutualTlsAuthentication.TruststoreVersion =
          domain.tlsTruststoreVersion
      }
    }

    try {
      const domainInfo = await this.apiGateway.send(
        new CreateDomainNameCommand(params),
      )
      return new DomainInfo(domainInfo)
    } catch (err) {
      throw new ServerlessError(
        `V2 - Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_CREATION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Get Custom Domain Info
   * @param {DomainConfig} domain
   * @param {boolean} silent To issue an error or not. Not by default.
   * @returns {Promise<DomainInfo>}
   */
  async getCustomDomain(domain, silent = true) {
    // Make API call
    try {
      const domainInfo = await this.apiGateway.send(
        new GetDomainNameCommand({
          DomainName: domain.givenDomainName,
        }),
      )
      return new DomainInfo(domainInfo)
    } catch (err) {
      const statusCode = err.$metadata?.httpStatusCode
      if (!statusCode || statusCode !== 404 || !silent) {
        throw new ServerlessError(
          `V2 - Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`,
          ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_FETCH_FAILED,
          { originalMessage: err.message },
        )
      }
      Logging.logInfo(`V2 - '${domain.givenDomainName}' does not exist.`)
    }
  }

  /**
   * Delete Custom Domain Name
   * @param {DomainConfig} domain
   * @returns {Promise<void>}
   */
  async deleteCustomDomain(domain) {
    // Make API call
    try {
      await this.apiGateway.send(
        new DeleteDomainNameCommand({
          DomainName: domain.givenDomainName,
        }),
      )
    } catch (err) {
      throw new ServerlessError(
        `V2 - Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_DELETION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  async updateCustomDomain(domain) {
    if (
      !domain.hasSecurityPolicyConfigured ||
      domain.domainInfo?.securityPolicy === domain.securityPolicy
    ) {
      return null
    }

    const effectiveCertificateArn =
      domain.certificateArn || domain.domainInfo?.certificateArn

    if (!effectiveCertificateArn) {
      throw new ServerlessError(
        `V2 - Failed to update custom domain '${domain.givenDomainName}':\nCertificate ARN is required to update API Gateway V2 domain security policy.`,
        ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_UPDATE_FAILED,
      )
    }

    const domainNameConfigurations = [
      {
        CertificateArn: effectiveCertificateArn,
        SecurityPolicy: domain.securityPolicy,
      },
    ]

    try {
      if (Globals.options?.debug) {
        Logging.logInfo(
          `V2 - Sending custom domain update request for '${domain.givenDomainName}': ${JSON.stringify(
            domainNameConfigurations,
          )}`,
        )
      }

      const domainInfo = await this.apiGateway.send(
        new UpdateDomainNameCommand({
          DomainName: domain.givenDomainName,
          DomainNameConfigurations: domainNameConfigurations,
        }),
      )
      return new DomainInfo(domainInfo)
    } catch (err) {
      throw new ServerlessError(
        `V2 - Failed to update custom domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_UPDATE_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Create Base Path Mapping
   * @param {DomainConfig} domain
   * @returns {Promise<void>}
   */
  async createBasePathMapping(domain) {
    try {
      await this.apiGateway.send(
        new CreateApiMappingCommand({
          ApiId: domain.apiId,
          ApiMappingKey: domain.basePath,
          DomainName: domain.givenDomainName,
          Stage:
            domain.apiType === Globals.apiTypes.http
              ? '$default'
              : domain.stage,
        }),
      )
      Logging.logInfo(
        `V2 - Created API mapping '${Logging.formatBasePathForDisplay(domain.basePath)}' for '${domain.givenDomainName}'`,
      )
    } catch (err) {
      throw new ServerlessError(
        `V2 - Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains
          .API_GATEWAY_BASE_PATH_MAPPING_CREATION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Get APi Mapping
   * @param {DomainConfig} domain
   * @returns {Promise<ApiGatewayMap[]>}
   */
  async getBasePathMappings(domain) {
    try {
      const items = await getAWSPagedResults(
        this.apiGateway,
        'Items',
        'NextToken',
        'NextToken',
        new GetApiMappingsCommand({
          DomainName: domain.givenDomainName,
        }),
      )
      return items.map(
        (item) =>
          new ApiGatewayMap(
            item.ApiId,
            item.ApiMappingKey,
            item.Stage,
            item.ApiMappingId,
          ),
      )
    } catch (err) {
      throw new ServerlessError(
        `V2 - Make sure the '${domain.givenDomainName}' exists. Unable to get API Mappings:\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_BASE_PATH_MAPPING_FETCH_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Update APi Mapping
   * @param {DomainConfig} domain
   * @returns {Promise<void>}
   */
  async updateBasePathMapping(domain) {
    try {
      await this.apiGateway.send(
        new UpdateApiMappingCommand({
          ApiId: domain.apiId,
          ApiMappingId: domain.apiMapping.apiMappingId,
          ApiMappingKey: domain.basePath,
          DomainName: domain.givenDomainName,
          Stage:
            domain.apiType === Globals.apiTypes.http
              ? '$default'
              : domain.stage,
        }),
      )
      Logging.logInfo(
        `V2 - Updated API mapping to '${Logging.formatBasePathForDisplay(domain.basePath)}' for '${domain.givenDomainName}'`,
      )
    } catch (err) {
      throw new ServerlessError(
        `V2 - Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains
          .API_GATEWAY_BASE_PATH_MAPPING_UPDATE_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Delete Api Mapping
   * @param {DomainConfig} domain
   * @returns {Promise<void>}
   */
  async deleteBasePathMapping(domain) {
    try {
      await this.apiGateway.send(
        new DeleteApiMappingCommand({
          ApiMappingId: domain.apiMapping.apiMappingId,
          DomainName: domain.givenDomainName,
        }),
      )
      Logging.logInfo(
        `V2 - Removed API Mapping with id: '${domain.apiMapping.apiMappingId}'`,
      )
    } catch (err) {
      throw new ServerlessError(
        `V2 - Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains
          .API_GATEWAY_BASE_PATH_MAPPING_DELETION_FAILED,
        { originalMessage: err.message },
      )
    }
  }
}

export default APIGatewayV2Wrapper
