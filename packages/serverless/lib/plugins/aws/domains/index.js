'use strict'

import ACMWrapper from './aws/acm-wrapper.js'
import CloudFormationWrapper from './aws/cloud-formation-wrapper.js'
import Route53Wrapper, { ChangeAction } from './aws/route53-wrapper.js'
import S3Wrapper from './aws/s3-wrapper.js'
import DomainConfig from './models/domain-config.js'
import Globals from './globals.js'
import { sleep } from './utils.js'
import APIGatewayV1Wrapper from './aws/api-gateway-v1-wrapper.js'
import APIGatewayV2Wrapper from './aws/api-gateway-v2-wrapper.js'
import Logging from './logging.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

class ServerlessCustomDomain {
  // Domain Manager specific properties
  domains = []

  constructor(serverless, options, v3Utils) {
    this.serverless = serverless
    Globals.serverless = serverless

    this.options = options
    Globals.options = options

    if (v3Utils?.log) {
      Globals.v3Utils = v3Utils
    }

    /* eslint camelcase: ["error", {allow: ["create_domain", "delete_domain"]}] */
    this.commands = {
      create_domain: {
        lifecycleEvents: ['create', 'initialize'],
        usage:
          'Creates a domain using the domain name defined in the serverless file',
      },
      delete_domain: {
        lifecycleEvents: ['delete', 'initialize'],
        usage:
          'Deletes a domain using the domain name defined in the serverless file',
      },
    }
    this.hooks = {
      'after:deploy:deploy': this.hookWrapper.bind(
        this,
        this.setupBasePathMappings,
      ),
      'after:info:info': this.hookWrapper.bind(this, this.domainSummaries),
      'before:deploy:deploy': this.hookWrapper.bind(
        this,
        this.createOrGetDomainForCfOutputs,
      ),
      'before:remove:remove': this.hookWrapper.bind(
        this,
        this.removeBasePathMappings,
      ),
      'create_domain:create': this.hookWrapper.bind(this, this.createDomains),
      'delete_domain:delete': this.hookWrapper.bind(this, this.deleteDomains),
    }
  }

  /**
   * Wrapper for lifecycle function, initializes variables and checks if enabled.
   * @param {Function} lifecycleFunc lifecycle function that actually does desired action
   */
  async hookWrapper(lifecycleFunc) {
    if (
      !this.serverless.service.provider?.domain &&
      !this.serverless.service.provider?.domains
    ) {
      return
    }

    // init config variables
    this.initializeVariables()
    // Validate the domain configurations
    this.validateDomainConfigs()
    // setup AWS resources
    await this.initSLSCredentials()
    await this.initAWSRegion()
    await this.initAWSResources()

    return lifecycleFunc.call(this)
  }

  /**
   * Detects API types from the CloudFormation template
   * @returns {string[]} Array of detected API types
   */
  detectApiTypesFromTemplate() {
    const resources =
      this.serverless.service.provider.compiledCloudFormationTemplate
        ?.Resources || {}
    const detectedApiTypes = []

    // Check for each API type in the CloudFormation resources
    Object.entries(Globals.CFResourceIds).forEach(([apiType, resourceId]) => {
      if (resources[resourceId]) {
        detectedApiTypes.push(apiType)
      }
    })

    return detectedApiTypes
  }

  /**
   * Gets the API type to use for domains that don't have an explicit apiType
   * @returns {string} The API type to use
   */
  getDefaultApiType() {
    const detectedApiTypes = this.detectApiTypesFromTemplate()

    if (detectedApiTypes.length === 0) {
      // Fallback to HTTP if no API resources found
      return Globals.apiTypes.http
    }

    if (detectedApiTypes.length === 1) {
      return detectedApiTypes[0]
    }

    // Multiple API types found - throw error
    throw new ServerlessError(
      `Multiple API types detected in CloudFormation template: ${detectedApiTypes.join(', ')}.\n` +
        'Please explicitly specify the apiType for each domain configuration.\n' +
        'Example:\n' +
        'domains:\n' +
        '  - domainName: api.example.com\n' +
        '    apiType: rest\n' +
        '  - domainName: ws.example.com\n' +
        '    apiType: websocket',
      ServerlessErrorCodes.domains.DOMAIN_CONFIG_MULTIPLE_API_TYPES_DETECTED,
    )
  }

  /**
   * Goes through custom domain property and initializes local variables and cloudformation template
   */
  initializeVariables() {
    const domainConfig = this.serverless.service.provider.domain
      ? [this.serverless.service.provider.domain]
      : []
    const domainsConfig = this.serverless.service.provider.domains || []

    const customDomains = domainConfig
      .concat(domainsConfig)
      .map((item) => (typeof item === 'string' ? { name: item } : item))

    // Lazy evaluation: compute default API type only when needed
    let defaultApiType = null

    // Loop over the domain configurations and populate the domains array with DomainConfigs
    this.domains = []
    customDomains.forEach((domain) => {
      // If the key of the item in config is an API type then using per API type domain structure
      let isTypeConfigFound = false
      Object.keys(Globals.apiTypes).forEach((apiType) => {
        const domainTypeConfig = domain[apiType]
        if (domainTypeConfig) {
          domainTypeConfig.apiType = apiType
          this.domains.push(new DomainConfig(domainTypeConfig))
          isTypeConfigFound = true
        }
      })

      if (!isTypeConfigFound) {
        // Use detected API type if no explicit apiType is provided
        if (!domain.apiType) {
          if (defaultApiType === null) {
            defaultApiType = this.getDefaultApiType()
          }
          domain.apiType = defaultApiType
        }
        this.domains.push(new DomainConfig(domain))
      }
    })

    // Filter inactive domains
    this.domains = this.domains.filter((domain) => domain.enabled)
  }

  /**
   * Validates domain configs to make sure they are valid, ie HTTP api cannot be used with EDGE domain
   */
  validateDomainConfigs() {
    this.domains.forEach((domain) => {
      if (
        domain.hasSecurityPolicyConfigured &&
        this.usesApiGatewayV2(domain) &&
        !Object.values(Globals.tlsVersions).includes(domain.securityPolicy)
      ) {
        throw new ServerlessError(
          `'securityPolicy' '${domain.securityPolicy}' is not supported for API Gateway V2 domains. ` +
            "Use 'TLS_1_0' or 'TLS_1_2'.",
          ServerlessErrorCodes.domains
            .DOMAIN_VALIDATION_INCOMPATIBLE_SECURITY_POLICY,
        )
      }

      if (domain.accessMode && this.usesApiGatewayV2(domain)) {
        throw new ServerlessError(
          `'accessMode' is only supported for REST domains managed by API Gateway V1. ` +
            `Domain '${domain.givenDomainName}' resolves to API Gateway V2 because ` +
            `${domain.apiType === Globals.apiTypes.rest ? "the 'basePath' uses multiple segments" : `'apiType' is '${domain.apiType.toLowerCase()}'`}. ` +
            "Remove 'accessMode' or use a single-level basePath on a REST domain.",
          ServerlessErrorCodes.domains
            .DOMAIN_VALIDATION_INCOMPATIBLE_ACCESS_MODE,
        )
      }

      if (domain.apiType === Globals.apiTypes.rest) {
        // No validation for REST API types
      } else if (domain.apiType === Globals.apiTypes.http) {
        // HTTP APIs do not support edge domains
        if (domain.endpointType === Globals.endpointTypes.edge) {
          // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html
          throw new ServerlessError(
            "'EDGE' endpointType is not compatible with HTTP APIs. Please change the endpointType to 'REGIONAL' or the apiType to 'rest' or 'websocket'.\n" +
              'https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html',
            ServerlessErrorCodes.domains
              .DOMAIN_VALIDATION_INCOMPATIBLE_ENDPOINT_TYPE,
          )
        }
      } else if (domain.apiType === Globals.apiTypes.websocket) {
        // Websocket APIs do not support edge domains
        if (domain.endpointType === Globals.endpointTypes.edge) {
          throw new ServerlessError(
            "'EDGE' endpointType is not compatible with WebSocket APIs",
            ServerlessErrorCodes.domains
              .DOMAIN_VALIDATION_INCOMPATIBLE_ENDPOINT_TYPE,
          )
        }
      }
    })
  }

  /**
   * Init AWS credentials from the framework (already honors provider.profile and --aws-profile)
   */
  async initSLSCredentials() {
    Globals.credentials = await this.serverless.providers.aws.getCredentials()
  }

  /**
   * Init AWS current region from the framework (already honors --region and provider.region)
   */
  async initAWSRegion() {
    Globals.currentRegion = this.serverless.providers.aws.getRegion()
  }

  /**
   * Setup AWS resources
   */
  async initAWSResources() {
    this.apiGatewayV1Wrapper = new APIGatewayV1Wrapper(Globals.credentials)
    this.apiGatewayV2Wrapper = new APIGatewayV2Wrapper(Globals.credentials)
    this.cloudFormationWrapper = new CloudFormationWrapper(Globals.credentials)
    this.s3Wrapper = new S3Wrapper(Globals.credentials)
  }

  usesApiGatewayV2(domain) {
    if (domain.apiType !== Globals.apiTypes.rest) {
      return true
    }

    // Multi-level base path mappings for REST domains are managed through the v2 APIs.
    // https://github.com/amplify-education/serverless-domain-manager/issues/558
    // https://aws.amazon.com/blogs/compute/using-multiple-segments-in-amazon-api-gateway-base-path-mapping/
    // endpointAccessMode exists only on v1 CreateDomainName, so those paths cannot honor accessMode.
    return domain.basePath.includes('/')
  }

  getApiGateway(domain) {
    // 1. https://stackoverflow.com/questions/72339224/aws-v1-vs-v2-api-for-listing-apis-on-aws-api-gateway-return-different-data-for-t
    // 2. https://aws.amazon.com/blogs/compute/announcing-http-apis-for-amazon-api-gateway/
    // There are currently two API Gateway namespaces for managing API Gateway deployments.
    // The API V1 namespace represents REST APIs and API V2 represents WebSocket APIs and the new HTTP APIs.
    // You can create an HTTP API by using the AWS Management Console, CLI, APIs, CloudFormation, SDKs, or the Serverless Application Model (SAM).
    if (this.usesApiGatewayV2(domain)) {
      return this.apiGatewayV2Wrapper
    }

    return this.apiGatewayV1Wrapper
  }

  /**
   * Lifecycle function to create a domain
   * Wraps creating a domain and resource record set
   */
  async createDomains() {
    await Promise.all(
      this.domains.map(async (domain) => {
        await this.createDomain(domain)
      }),
    )
  }

  /**
   * Lifecycle function to create a domain
   * Wraps creating a domain and resource record set
   * @param {DomainConfig} domain
   */
  async createDomain(domain) {
    const creationProgress =
      Globals.v3Utils &&
      Globals.v3Utils.progress.get(`create-${domain.givenDomainName}`)
    const route53Creds = domain.route53Profile
      ? await Globals.getProfileCreds(domain.route53Profile)
      : Globals.credentials

    const apiGateway = this.getApiGateway(domain)
    const route53 = new Route53Wrapper(route53Creds, domain.route53Region)
    const acm = new ACMWrapper(Globals.credentials, domain.endpointType)

    domain.domainInfo = await apiGateway.getCustomDomain(domain)

    try {
      if (!domain.domainInfo) {
        if (domain.tlsTruststoreUri) {
          await this.s3Wrapper.assertTlsCertObjectExists(domain)
        }
        if (!domain.certificateArn) {
          // Try to find existing certificate first
          try {
            domain.certificateArn = await acm.getCertArn(domain)
          } catch (certErr) {
            // If no certificate found and no certificateName provided, try auto-creation
            if (
              !domain.certificateName &&
              certErr.message.includes(
                'Could not find an in-date certificate for',
              )
            ) {
              Logging.logInfo(
                'No existing certificate found. Checking if domain is managed by Route53...',
              )

              // Check if domain is managed by Route53
              const isDomainManaged = await route53.isDomainManagedByRoute53(
                domain.givenDomainName,
              )

              if (isDomainManaged) {
                Logging.logInfo(
                  'Domain is managed by Route53. Creating ACM certificate automatically...',
                )

                // Create new ACM certificate
                domain.certificateArn = await acm.createCertificate(
                  domain.givenDomainName,
                )

                // Get DNS validation records
                const validationRecords =
                  await acm.getCertificateValidationRecords(
                    domain.certificateArn,
                  )

                // Create DNS validation records in Route53
                await route53.createCertificateValidationRecords(
                  validationRecords,
                  domain.givenDomainName,
                )

                // Wait for certificate validation
                await acm.waitForCertificateValidation(domain.certificateArn)

                Logging.logInfo(
                  'ACM certificate has been created and validated successfully!',
                )
              } else {
                Logging.logWarning(
                  'Domain is not managed by Route53. Cannot auto-create certificate.',
                )
                throw certErr
              }
            } else {
              // Re-throw original error if certificateName was provided or different error
              throw certErr
            }
          }
        }
        domain.domainInfo = await apiGateway.createCustomDomain(domain)
        Logging.logInfo(`Custom domain '${domain.givenDomainName}' was created.
                 New domains may take up to 40 minutes to be initialized.`)
      } else {
        const updatedDomainInfo = await apiGateway.updateCustomDomain(domain)
        if (updatedDomainInfo) {
          domain.domainInfo = updatedDomainInfo
          Logging.logInfo(
            `Custom domain '${domain.givenDomainName}' was updated.`,
          )
        } else {
          Logging.logInfo(
            `Custom domain '${domain.givenDomainName}' already exists.`,
          )
        }
      }
      await route53.changeResourceRecordSet(ChangeAction.UPSERT, domain)
    } catch (err) {
      throw new ServerlessError(
        `Unable to create domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.DOMAIN_CREATION_FAILED,
        { originalMessage: err.message },
      )
    } finally {
      if (creationProgress) {
        creationProgress.remove()
      }
    }
  }

  /**
   * Lifecycle function to delete a domain
   * Wraps deleting a domain and resource record set
   */
  async deleteDomains() {
    await Promise.all(
      this.domains.map(async (domain) => {
        await this.deleteDomain(domain)
      }),
    )
  }

  /**
   * Wraps deleting a domain and resource record set
   * @param {DomainConfig} domain
   */
  async deleteDomain(domain) {
    const apiGateway = this.getApiGateway(domain)
    const route53Creds = domain.route53Profile
      ? await Globals.getProfileCreds(domain.route53Profile)
      : null
    const route53 = new Route53Wrapper(route53Creds, domain.route53Region)

    domain.domainInfo = await apiGateway.getCustomDomain(domain)
    try {
      if (domain.domainInfo) {
        await apiGateway.deleteCustomDomain(domain)
        await route53.changeResourceRecordSet(ChangeAction.DELETE, domain)
        domain.domainInfo = null
        Logging.logInfo(`Custom domain ${domain.givenDomainName} was deleted.`)
      } else {
        Logging.logInfo(
          `Custom domain ${domain.givenDomainName} does not exist.`,
        )
      }
    } catch (err) {
      throw new ServerlessError(
        `Unable to delete domain '${domain.givenDomainName}':\n${err.message}`,
        ServerlessErrorCodes.domains.DOMAIN_DELETION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Lifecycle function to createDomain before deploy and add domain info to the CloudFormation stack's Outputs
   */
  async createOrGetDomainForCfOutputs() {
    await Promise.all(
      this.domains.map(async (domain) => {
        if (domain.autoDomain) {
          Logging.logInfo('Creating domain name before deploy.')
          await this.createDomain(domain)
        }

        const apiGateway = this.getApiGateway(domain)
        domain.domainInfo = await apiGateway.getCustomDomain(domain)

        if (domain.autoDomain) {
          const atLeastOneDoesNotExist = () =>
            this.domains.some((d) => !d.domainInfo)
          const maxWaitFor = parseInt(domain.autoDomainWaitFor, 10) || 120
          const pollInterval = 3
          for (
            let i = 0;
            i * pollInterval < maxWaitFor && atLeastOneDoesNotExist() === true;
            i++
          ) {
            Logging.logInfo(`
                        Poll #${i + 1}: polling every ${pollInterval} seconds
                        for domain to exist or until ${maxWaitFor} seconds
                        have elapsed before starting deployment
                    `)
            await sleep(pollInterval)
            domain.domainInfo = await apiGateway.getCustomDomain(domain)
          }
        }
        this.addOutputs(domain)
      }),
    )
  }

  /**
   * Lifecycle function to create basepath mapping
   * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
   */
  async setupBasePathMappings() {
    await Promise.all(
      this.domains.map(async (domain) => {
        domain.apiId = await this.cloudFormationWrapper.findApiId(
          domain.apiType,
        )

        const apiGateway = this.getApiGateway(domain)
        const mappings = await apiGateway.getBasePathMappings(domain)

        const filteredMappings = mappings.filter((mapping) => {
          if (domain.allowPathMatching) {
            return mapping.basePath === domain.basePath
          }
          return mapping.apiId === domain.apiId
        })
        domain.apiMapping = filteredMappings ? filteredMappings[0] : null
        domain.domainInfo = await apiGateway.getCustomDomain(domain, false)

        if (!domain.apiMapping) {
          await apiGateway.createBasePathMapping(domain)
        } else {
          await apiGateway.updateBasePathMapping(domain)
        }
      }),
    ).finally(() => {
      Logging.printDomainSummary(this.domains)
    })
  }

  /**
   * Lifecycle function to delete basepath mapping
   * Wraps deletion of basepath mapping
   */
  async removeBasePathMappings() {
    await Promise.all(
      this.domains.map(async (domain) => {
        let externalBasePathExists = false
        try {
          domain.apiId = await this.cloudFormationWrapper.findApiId(
            domain.apiType,
          )
          // Unable to find the corresponding API, manual clean up will be required
          if (!domain.apiId) {
            Logging.logInfo(`Unable to find corresponding API for '${domain.givenDomainName}',
                        API Mappings may need to be manually removed.`)
          } else {
            const apiGateway = this.getApiGateway(domain)
            const mappings = await apiGateway.getBasePathMappings(domain)
            const filteredMappings = mappings.filter((mapping) => {
              if (domain.allowPathMatching) {
                return mapping.basePath === domain.basePath
              }
              return (
                mapping.apiId === domain.apiId && mapping.stage === domain.stage
              )
            })
            if (domain.preserveExternalPathMappings) {
              externalBasePathExists = mappings.length > filteredMappings.length
            }
            domain.apiMapping = filteredMappings ? filteredMappings[0] : null
            if (domain.apiMapping) {
              await apiGateway.deleteBasePathMapping(domain)
            } else {
              Logging.logWarning(
                `Api mapping was not found for '${domain.givenDomainName}'. Skipping base path deletion.`,
              )
            }
          }
        } catch (err) {
          if (err.message.indexOf('Failed to find CloudFormation') > -1) {
            Logging.logWarning(`Unable to find Cloudformation Stack for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`)
          } else {
            Logging.logWarning(
              `Unable to remove base path mappings for '${domain.givenDomainName}':\n${err.message}`,
            )
          }
          if (domain.preserveExternalPathMappings) {
            externalBasePathExists = true
          }
        }

        if (domain.autoDomain === true && !externalBasePathExists) {
          Logging.logInfo(
            'Deleting domain name after removing base path mapping.',
          )
          await this.deleteDomain(domain)
        }
      }),
    )
  }

  /**
   * Lifecycle function to print domain summary
   * Wraps printing of all domain manager related info
   */
  async domainSummaries() {
    await Promise.all(
      this.domains.map(async (domain) => {
        const apiGateway = this.getApiGateway(domain)
        domain.domainInfo = await apiGateway.getCustomDomain(domain)
      }),
    ).finally(() => {
      Logging.printDomainSummary(this.domains)
    })
  }

  /**
   *  Adds the domain name and distribution domain name to the CloudFormation outputs
   * @param {DomainConfig} domain
   */
  addOutputs(domain) {
    const service = this.serverless.service
    if (!service.provider.compiledCloudFormationTemplate.Outputs) {
      service.provider.compiledCloudFormationTemplate.Outputs = {}
    }

    // Defaults for REST and backwards compatibility
    let distributionDomainNameOutputKey = 'DistributionDomainName'
    let domainNameOutputKey = 'DomainName'
    let hostedZoneIdOutputKey = 'HostedZoneId'

    if (domain.apiType === Globals.apiTypes.http) {
      distributionDomainNameOutputKey += 'Http'
      domainNameOutputKey += 'Http'
      hostedZoneIdOutputKey += 'Http'
    } else if (domain.apiType === Globals.apiTypes.websocket) {
      distributionDomainNameOutputKey += 'Websocket'
      domainNameOutputKey += 'Websocket'
      hostedZoneIdOutputKey += 'Websocket'
    }

    // for the CloudFormation stack we should use the `base` stage not the plugin custom stage
    // Remove all special characters
    const safeStage = Globals.getBaseStage().replace(/[^a-zA-Z\d]/g, '')
    service.provider.compiledCloudFormationTemplate.Outputs[
      domainNameOutputKey
    ] = {
      Value: domain.givenDomainName,
      Export: {
        Name: `sls-${service.service}-${safeStage}-${domainNameOutputKey}`,
      },
    }

    if (domain.domainInfo) {
      service.provider.compiledCloudFormationTemplate.Outputs[
        distributionDomainNameOutputKey
      ] = {
        Value: domain.domainInfo.domainName,
        Export: {
          Name: `sls-${service.service}-${safeStage}-${distributionDomainNameOutputKey}`,
        },
      }
      service.provider.compiledCloudFormationTemplate.Outputs[
        hostedZoneIdOutputKey
      ] = {
        Value: domain.domainInfo.hostedZoneId,
        Export: {
          Name: `sls-${service.service}-${safeStage}-${hostedZoneIdOutputKey}`,
        },
      }
    }
  }
}

export default ServerlessCustomDomain
