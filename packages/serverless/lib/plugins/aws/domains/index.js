'use strict'

import ACMWrapper from './aws/acm-wrapper.js'
import CloudFormationWrapper from './aws/cloud-formation-wrapper.js'
import Route53Wrapper, { ChangeAction } from './aws/route53-wrapper.js'
import S3Wrapper from './aws/s3-wrapper.js'
import DomainConfig from './models/domain-config.js'
import WebAppDomainConfig, {
  getUnremovedRecordsMessage,
} from './models/web-app-domain-config.js'
import Globals from './globals.js'
import { listDomainEntries, sleep } from './utils.js'
import APIGatewayV1Wrapper from './aws/api-gateway-v1-wrapper.js'
import APIGatewayV2Wrapper from './aws/api-gateway-v2-wrapper.js'
import Logging from './logging.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { getDistributionLogicalIds } from '../web-apps/compilers/domain.js'

// Appended to a missing hosted zone error for a hostname that serves web apps.
const MANAGE_DNS_YOURSELF =
  'Set createRoute53Record: false on the domain entry to manage DNS yourself.'

// Appended to a missing certificate error for a hostname that serves web apps.
const CLOUDFRONT_CERTIFICATE_REGION =
  'CloudFront uses certificates from us-east-1; request or import the certificate there.'

/**
 * `err` with `context` appended to its message, keeping its code.
 * @param {Error & { code?: string, originalMessage?: string }} err
 * @param {string} context - appended as is, separator included
 * @returns {ServerlessError}
 */
const withContext = (err, context) =>
  new ServerlessError(`${err.message}${context}`, err.code, {
    originalMessage: err.originalMessage ?? err.message,
  })

/**
 * `err` with the line on managing DNS outside Route 53 appended.
 * @param {Error & { code?: string, originalMessage?: string }} err
 * @returns {ServerlessError}
 */
const withManageDnsContext = (err) =>
  withContext(err, `\n${MANAGE_DNS_YOURSELF}`)

/**
 * Steps shown on the deploy's main progress line, which the deploy owns: only
 * when a step takes minutes, and with the line's previous message put back
 * when the last one ends, rather than removed. Steps run in parallel, one per
 * key, and the line shows the latest of those still running.
 * @returns {{ show: (key: string, message: string) => void, end: (key: string) => void }}
 */
const mainProgressSteps = () => {
  let line
  let previousMessage
  const running = new Map()
  return {
    show(key, message) {
      if (!line) {
        line = Globals.v3Utils?.progress?.get('main')
        previousMessage = line?.message
      }
      // Map order is insertion order: the latest message goes last
      running.delete(key)
      running.set(key, message)
      line?.notice(message)
    },
    end(key) {
      if (!running.delete(key)) return
      // Without an animated line (no TTY) a notice is printed as a log line
      // and the line keeps no message, so there is nothing to put back
      if (line?.message == null) return
      const next = [...running.values()].at(-1) ?? previousMessage
      if (next != null) line.notice(next)
    },
  }
}

class ServerlessCustomDomain {
  // Domain Manager specific properties
  domains = []
  // provider.domain(s) entries with webApp, served through CloudFront
  webAppDomains = []

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
    // API Gateway entries (this.domains) and web-app entries
    // (this.webAppDomains) each run their own step of a lifecycle.
    this.hooks = {
      'after:deploy:deploy': this.hookWrapper.bind(this, async function () {
        await this.setupBasePathMappings()
        await this.upsertWebAppAliases()
      }),
      // info and remove only read web-app entries: an invalid one, or one
      // without a hostname, is skipped (info prints the warning with the
      // endpoints), so the stack can always be removed
      'after:info:info': this.hookWrapper.bind(this, this.domainSummaries, {
        invalidWebAppDomains: 'skip',
      }),
      'before:deploy:deploy': this.hookWrapper.bind(this, async function () {
        // Before any API Gateway domain is created, so a stop changes nothing.
        await this.assertWebAppHostnamesAreFree()
        await this.createOrGetDomainForCfOutputs()
      }),
      // Before change detection hashes the template, so the hash covers the
      // certificate ARN the template is deployed with.
      'before:aws:deploy:deploy:checkForChanges': this.hookWrapper.bind(
        this,
        this.ensureWebAppCertificates,
      ),
      'before:remove:remove': this.hookWrapper.bind(
        this,
        async function () {
          await this.deleteWebAppAliases()
          await this.removeBasePathMappings()
        },
        { invalidWebAppDomains: 'warn' },
      ),
      // API Gateway domains only
      'create_domain:create': this.hookWrapper.bind(this, this.createDomains, {
        invalidWebAppDomains: 'skip',
      }),
      'delete_domain:delete': this.hookWrapper.bind(this, this.deleteDomains, {
        invalidWebAppDomains: 'skip',
      }),
    }
  }

  /**
   * Wrapper for lifecycle function, initializes variables and checks if enabled.
   * @param {Function} lifecycleFunc lifecycle function that actually does desired action
   * @param {object} [options]
   * @param {'throw'|'warn'|'skip'} [options.invalidWebAppDomains] - what to do with an
   *   invalid web-app entry, or an enabled one without a hostname (see initializeVariables)
   */
  async hookWrapper(lifecycleFunc, options = {}) {
    if (
      !this.serverless.service.provider?.domain &&
      !this.serverless.service.provider?.domains
    ) {
      return
    }

    // init config variables
    this.initializeVariables(options)
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
   * Goes through custom domain property and initializes local variables and cloudformation template.
   * Entries with webApp go to this.webAppDomains, before any default apiType is assigned;
   * all others to this.domains. An invalid web-app entry, or an enabled one without a
   * hostname, is an error by default (deploy needs a valid one), skipped with a warning for
   * 'warn', or skipped for 'skip'. API Gateway entries are always read strictly.
   * @param {object} [options]
   * @param {'throw'|'warn'|'skip'} [options.invalidWebAppDomains]
   */
  initializeVariables({ invalidWebAppDomains = 'throw' } = {}) {
    const customDomains = listDomainEntries(this.serverless.service.provider)
    const warnWebAppDomain = {
      throw: undefined,
      warn: (message) => Logging.logWarning(message),
      skip: () => {},
    }[invalidWebAppDomains]

    // Lazy evaluation: compute default API type only when needed
    let defaultApiType = null

    // Loop over the domain configurations and populate the domains array with DomainConfigs
    this.domains = []
    this.webAppDomains = []
    customDomains.forEach(({ path, config: domain }) => {
      // An empty list item, which only configValidationMode: off lets through
      if (domain == null) return

      if (domain.webApp != null) {
        this.webAppDomains.push(
          ...WebAppDomainConfig.read(domain, path, {
            // 'warn' is remove's mode: name the records it leaves in place
            warn:
              invalidWebAppDomains === 'warn'
                ? (message) =>
                    warnWebAppDomain(
                      `${message} ${getUnremovedRecordsMessage(domain)}`,
                    )
                : warnWebAppDomain,
          }),
        )
        return
      }

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
    this.webAppDomains = WebAppDomainConfig.withHostnames(
      this.webAppDomains.filter((domain) => domain.enabled),
      { warn: warnWebAppDomain },
    )
  }

  /**
   * Validates domain configs to make sure they are valid, ie HTTP api cannot be used with EDGE domain
   */
  validateDomainConfigs() {
    this.domains.forEach((domain) => {
      if (
        domain.hasSecurityPolicyConfigured &&
        this.usesApiGatewayV2(domain) &&
        domain.securityPolicy !== Globals.tlsVersions.tls_1_2
      ) {
        throw new ServerlessError(
          `'securityPolicy' '${domain.securityPolicy}' is not supported for API Gateway V2 domains. ` +
            "Use 'TLS_1_2'.",
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

      if (
        domain.accessMode &&
        !this.usesApiGatewayV2(domain) &&
        !domain.securityPolicy.startsWith('SecurityPolicy_')
      ) {
        throw new ServerlessError(
          `'accessMode' requires an enhanced 'securityPolicy' (SecurityPolicy_*) for API Gateway V1 domains. ` +
            `Domain '${domain.givenDomainName}' is using '${domain.securityPolicy}'.`,
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
        await this.ensureCertificate(domain, acm, route53)
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
   * Sets domain.certificateArn unless the entry has one: an existing in-date certificate
   * for the domain (or its certificateName), else, for a domain in a Route 53 hosted
   * zone, a new certificate validated through DNS records in that zone.
   * @param {DomainConfig|WebAppDomainConfig} domain
   * @param {ACMWrapper} acm
   * @param {Route53Wrapper} route53
   * @param {{ waitUntilIssued?: boolean, showProgress?: (message: string) => void }} [options]
   *   waitUntilIssued: also wait for an existing certificate that is still pending
   *   validation; showProgress: called before each step that takes minutes
   */
  async ensureCertificate(
    domain,
    acm,
    route53,
    { waitUntilIssued = false, showProgress } = {},
  ) {
    if (domain.certificateArn) {
      return
    }
    let certificate
    // Try to find existing certificate first
    try {
      certificate = await acm.getCertificate(domain)
    } catch (certErr) {
      // If no certificate found and no certificateName provided, try auto-creation
      if (
        !domain.certificateName &&
        certErr.message.includes('Could not find an in-date certificate for')
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

          showProgress?.(
            `Creating certificate for ${domain.givenDomainName} in us-east-1 (takes a few minutes)`,
          )
          // Create new ACM certificate
          domain.certificateArn = await acm.createCertificate(
            domain.givenDomainName,
          )

          // Get DNS validation records
          const validationRecords = await acm.getCertificateValidationRecords(
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
          return
        }
        Logging.logWarning(
          'Domain is not managed by Route53. Cannot auto-create certificate.',
        )
      }
      // Re-throw original error if certificateName was provided, a different error, or no hosted zone
      throw certErr
    }
    domain.certificateArn = certificate.arn
    if (waitUntilIssued && certificate.status === 'PENDING_VALIDATION') {
      showProgress?.(
        `Waiting for the certificate for ${domain.givenDomainName} to be issued`,
      )
      await acm.waitForCertificateValidation(domain.certificateArn)
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
   * Route 53 client for a web-app hostname: its route53Profile and route53Region, else the
   * deploy credentials and Region.
   * @param {WebAppDomainConfig} domain
   * @returns {Promise<Route53Wrapper>}
   */
  async getWebAppRoute53(domain) {
    const credentials = domain.route53Profile
      ? await Globals.getProfileCreds(domain.route53Profile)
      : Globals.credentials
    return new Route53Wrapper(credentials, domain.route53Region)
  }

  /**
   * Lifecycle function that stops the deploy when a web-app hostname already exists as an
   * API Gateway custom domain: a hostname serves either API Gateway APIs or web apps.
   */
  async assertWebAppHostnamesAreFree() {
    await Promise.all(
      WebAppDomainConfig.perHostname(this.webAppDomains).map(async (domain) => {
        const found = await Promise.all(
          [this.apiGatewayV1Wrapper, this.apiGatewayV2Wrapper].map(
            (apiGateway) =>
              apiGateway.getCustomDomain(domain, true, { logMissing: false }),
          ),
        )
        if (found.some(Boolean)) {
          throw new ServerlessError(
            `${domain.name} is already an API Gateway custom domain in this account, and a hostname serves either API Gateway APIs or web apps. Use another hostname for the web app, or delete the API Gateway custom domain first.`,
            'WEB_APPS_DOMAIN_IS_API_GATEWAY_DOMAIN',
            { stack: false },
          )
        }
      }),
    )
  }

  /**
   * Lifecycle function that writes each web-app hostname's certificate into its CloudFront
   * distribution: found or created in us-east-1 (the Region CloudFront reads certificates
   * from) and issued. Hostnames with a literal certificateArn were compiled with it.
   */
  async ensureWebAppCertificates() {
    const resources =
      this.serverless.service.provider.compiledCloudFormationTemplate
        ?.Resources || {}
    const pending = WebAppDomainConfig.perHostname(this.webAppDomains).filter(
      (domain) =>
        !domain.certificateArn &&
        resources[getDistributionLogicalIds(domain.name).distribution],
    )
    if (pending.length === 0) {
      return
    }

    const acm = new ACMWrapper(Globals.credentials, Globals.endpointTypes.edge)
    const progress = mainProgressSteps()
    await Promise.all(
      pending.map(async (domain) => {
        const route53 = await this.getWebAppRoute53(domain)
        try {
          await this.ensureCertificate(domain, acm, route53, {
            waitUntilIssued: true,
            showProgress: (message) => progress.show(domain.name, message),
          })
        } catch (err) {
          if (
            err.code !== ServerlessErrorCodes.domains.ACM_CERTIFICATE_NOT_FOUND
          ) {
            throw err
          }
          // Without certificateName, a missing certificate reaches here only when no
          // hosted zone was found to create one in.
          throw withContext(
            err,
            ` ${CLOUDFRONT_CERTIFICATE_REGION}${
              domain.certificateName || domain.createRoute53Record === false
                ? ''
                : `\n${MANAGE_DNS_YOURSELF}`
            }`,
          )
        } finally {
          progress.end(domain.name)
        }
        const { DistributionConfig } =
          resources[getDistributionLogicalIds(domain.name).distribution]
            .Properties
        DistributionConfig.ViewerCertificate = {
          ...DistributionConfig.ViewerCertificate,
          AcmCertificateArn: domain.certificateArn,
        }
      }),
    )
  }

  /**
   * Web-app hostnames whose Route 53 alias records the Framework manages, each with
   * domainInfo pointing at its distribution, read from the stack outputs. Hostnames whose
   * stack has no distribution output are left out, with a verbose log line.
   * @returns {Promise<WebAppDomainConfig[]>}
   */
  async getWebAppAliasTargets() {
    const domains = WebAppDomainConfig.perHostname(this.webAppDomains).filter(
      (domain) => domain.createRoute53Record,
    )
    if (domains.length === 0) {
      return []
    }
    const outputs = await this.cloudFormationWrapper.getStackOutputs()
    return domains.filter((domain) => {
      const { domainNameOutput } = getDistributionLogicalIds(domain.name)
      const distributionDomainName = outputs[domainNameOutput]
      if (!distributionDomainName) {
        Logging.logInfo(
          `No ${domainNameOutput} output in the stack; skipping the Route 53 records for ${domain.name}.`,
        )
        return false
      }
      domain.domainInfo = {
        domainName: distributionDomainName,
        hostedZoneId: Globals.cloudFrontHostedZoneId,
      }
      return true
    })
  }

  /**
   * Lifecycle function that points each web-app hostname at its CloudFront distribution
   * with A (and AAAA) alias records.
   */
  async upsertWebAppAliases() {
    const domains = await this.getWebAppAliasTargets()
    await Promise.all(
      domains.map(async (domain) => {
        const route53 = await this.getWebAppRoute53(domain)
        try {
          await route53.changeResourceRecordSet(ChangeAction.UPSERT, domain)
        } catch (err) {
          if (
            err.code ===
            ServerlessErrorCodes.route53.ROUTE53_HOSTED_ZONE_NOT_FOUND
          ) {
            throw withManageDnsContext(err)
          }
          throw err
        }
      }),
    )
  }

  /**
   * Lifecycle function that deletes the web-app alias records while the stack, and with it
   * the distribution domain names they point at, still exists. A failure is a warning, so
   * remove goes on, as it does for base path mappings.
   */
  async deleteWebAppAliases() {
    let domains
    try {
      domains = await this.getWebAppAliasTargets()
    } catch (err) {
      Logging.logWarning(
        `Unable to find the Route 53 records to remove:\n${err.message}`,
      )
      return
    }
    await Promise.all(
      domains.map(async (domain) => {
        try {
          const route53 = await this.getWebAppRoute53(domain)
          await route53.changeResourceRecordSet(ChangeAction.DELETE, domain)
        } catch (err) {
          Logging.logWarning(
            `Unable to remove the Route 53 records for '${domain.name}':\n${err.message}`,
          )
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
