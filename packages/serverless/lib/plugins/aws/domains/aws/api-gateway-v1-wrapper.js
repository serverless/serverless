/**
 * Wrapper class for AWS APIGateway provider
 */
import {
  APIGatewayClient,
  CreateDomainNameCommand,
  GetDomainNameCommand,
  DeleteDomainNameCommand,
  UpdateDomainNameCommand,
  CreateBasePathMappingCommand,
  GetBasePathMappingsCommand,
  UpdateBasePathMappingCommand,
  DeleteBasePathMappingCommand,
} from '@aws-sdk/client-api-gateway'
import { addProxyToAwsClient } from '@serverless/util'
import DomainInfo from '../models/domain-info.js'
import Globals from '../globals.js'
import ApiGatewayMap from '../models/api-gateway-map.js'
import APIGatewayBase from '../models/apigateway-base.js'
import Logging from '../logging.js'
import { getAWSPagedResults } from '../utils.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

class APIGatewayV1Wrapper extends APIGatewayBase {
  constructor(credentials) {
    super()
    const config = {
      region: Globals.getRegion(),
      endpoint: Globals.getServiceEndpoint('apigateway'),
      retryStrategy: Globals.getRetryStrategy(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.apiGateway = addProxyToAwsClient(new APIGatewayClient(config))
  }

  async createCustomDomain(domain) {
    const providerTags = {
      ...Globals.serverless.service.provider.stackTags,
      ...Globals.serverless.service.provider.tags,
    }

    const params = {
      domainName: domain.givenDomainName,
      endpointConfiguration: {
        types: [domain.endpointType],
      },
      securityPolicy: domain.securityPolicy,
      tags: providerTags,
    }

    if (domain.accessMode) {
      params.endpointAccessMode = domain.accessMode
    }

    const isEdgeType = domain.endpointType === Globals.endpointTypes.edge
    if (isEdgeType) {
      params.certificateArn = domain.certificateArn
    } else {
      params.regionalCertificateArn = domain.certificateArn

      if (domain.tlsTruststoreUri) {
        params.mutualTlsAuthentication = {
          truststoreUri: domain.tlsTruststoreUri,
        }

        if (domain.tlsTruststoreVersion) {
          params.mutualTlsAuthentication.truststoreVersion =
            domain.tlsTruststoreVersion
        }
      }
    }

    try {
      const domainInfo = await this.apiGateway.send(
        new CreateDomainNameCommand(params),
      )
      return new DomainInfo(domainInfo)
    } catch (err) {
      throw new ServerlessError(
        `V1 - Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`,
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
          domainName: domain.givenDomainName,
        }),
      )
      return new DomainInfo(domainInfo)
    } catch (err) {
      const statusCode = err.$metadata?.httpStatusCode
      if (!statusCode || statusCode !== 404 || !silent) {
        throw new ServerlessError(
          `V1 - Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`,
          ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_FETCH_FAILED,
          { originalMessage: err.message },
        )
      }
      Logging.logWarning(`V1 - '${domain.givenDomainName}' does not exist.`)
    }
  }

  async deleteCustomDomain(domain) {
    // Make API call
    try {
      await this.apiGateway.send(
        new DeleteDomainNameCommand({
          domainName: domain.givenDomainName,
        }),
      )
    } catch (err) {
      throw new ServerlessError(
        `V1 - Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_DELETION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  async updateCustomDomain(domain) {
    const patchOperations = []

    if (
      domain.hasSecurityPolicyConfigured &&
      domain.domainInfo?.securityPolicy !== domain.securityPolicy
    ) {
      patchOperations.push({
        op: 'replace',
        path: '/securityPolicy',
        value: domain.securityPolicy,
      })
    }

    if (
      domain.hasAccessModeConfigured &&
      domain.domainInfo?.accessMode !== domain.accessMode
    ) {
      patchOperations.push({
        op: 'replace',
        path: '/endpointAccessMode',
        value: domain.accessMode,
      })
    }

    if (patchOperations.length === 0) {
      return null
    }

    try {
      if (Globals.options?.debug) {
        Logging.logInfo(
          `V1 - Sending custom domain update request for '${domain.givenDomainName}': ${JSON.stringify(
            patchOperations,
          )}`,
        )
      }

      const domainInfo = await this.apiGateway.send(
        new UpdateDomainNameCommand({
          domainName: domain.givenDomainName,
          patchOperations,
        }),
      )
      return new DomainInfo(domainInfo)
    } catch (err) {
      throw new ServerlessError(
        `V1 - Failed to update custom domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_CUSTOM_DOMAIN_UPDATE_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  async createBasePathMapping(domain) {
    try {
      await this.apiGateway.send(
        new CreateBasePathMappingCommand({
          basePath: domain.basePath,
          domainName: domain.givenDomainName,
          restApiId: domain.apiId,
          stage: domain.stage,
        }),
      )
      Logging.logInfo(
        `V1 - Created API mapping '${Logging.formatBasePathForDisplay(domain.basePath)}' for '${domain.givenDomainName}'`,
      )
    } catch (err) {
      throw new ServerlessError(
        `V1 - Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains
          .API_GATEWAY_BASE_PATH_MAPPING_CREATION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  async getBasePathMappings(domain) {
    try {
      const items = await getAWSPagedResults(
        this.apiGateway,
        'items',
        'position',
        'position',
        new GetBasePathMappingsCommand({
          domainName: domain.givenDomainName,
        }),
      )
      return items.map((item) => {
        return new ApiGatewayMap(
          item.restApiId,
          item.basePath,
          item.stage,
          null,
        )
      })
    } catch (err) {
      throw new ServerlessError(
        `V1 - Make sure the '${domain.givenDomainName}' exists.
                 Unable to get Base Path Mappings:\n${err.message}`,
        ServerlessErrorCodes.domains.API_GATEWAY_BASE_PATH_MAPPING_FETCH_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  async updateBasePathMapping(domain) {
    Logging.logInfo(`V1 - Updating API mapping from '${Logging.formatBasePathForDisplay(domain.apiMapping.basePath)}'
            to '${Logging.formatBasePathForDisplay(domain.basePath)}' for '${domain.givenDomainName}'`)
    try {
      await this.apiGateway.send(
        new UpdateBasePathMappingCommand({
          basePath: domain.apiMapping.basePath,
          domainName: domain.givenDomainName,
          patchOperations: [
            {
              op: 'replace',
              path: '/basePath',
              value: domain.basePath,
            },
          ],
        }),
      )
    } catch (err) {
      throw new ServerlessError(
        `V1 - Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains
          .API_GATEWAY_BASE_PATH_MAPPING_UPDATE_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  async deleteBasePathMapping(domain) {
    try {
      await this.apiGateway.send(
        new DeleteBasePathMappingCommand({
          basePath: domain.apiMapping.basePath,
          domainName: domain.givenDomainName,
        }),
      )
      Logging.logInfo(
        `V1 - Removed '${Logging.formatBasePathForDisplay(domain.apiMapping.basePath)}' base path mapping`,
      )
    } catch (err) {
      throw new ServerlessError(
        `V1 - Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains
          .API_GATEWAY_BASE_PATH_MAPPING_DELETION_FAILED,
        { originalMessage: err.message },
      )
    }
  }
}

export default APIGatewayV1Wrapper
