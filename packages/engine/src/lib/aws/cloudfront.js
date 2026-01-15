import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateFunctionCommand,
  DeleteDistributionCommand,
  DeleteFunctionCommand,
  DescribeFunctionCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  GetFunctionCommand,
  ListDistributionsCommand,
  ListTagsForResourceCommand,
  PublishFunctionCommand,
  TagResourceCommand,
  UpdateDistributionCommand,
  UpdateFunctionCommand,
} from '@aws-sdk/client-cloudfront'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { addProxyToAwsClient, log } from '@serverless/util'

const logger = log.get('aws:cloudfront')

/**
 * AWS CloudFront Client
 */
export class AwsCloudFrontClient {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new CloudFrontClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  /**
   * Creates a CloudFront distribution with a custom origin (ALB or Lambda function URL)
   * @param {Object} params - The parameters for creating a CloudFront distribution
   * @param {string} params.resourceNameBase - The resource name base for the CloudFront distribution
   * @param {string} [params.albDnsName] - The DNS name of the ALB (if Fargate)
   * @param {string} [params.functionUrl] - The Lambda function URL (if Lambda)
   * @param {string} [params.certificateArn] - ACM certificate ARN for custom domain (optional)
   * @param {string} [params.domain] - Custom domain name (optional)
   * @returns {Promise<Object>} The created CloudFront distribution
   * @note The distribution will be tagged with a 'Name' tag using the resourceNameBase to avoid duplicates
   */
  async createDistribution({
    resourceNameBase,
    albDnsName,
    functionUrl,
    certificateArn,
    domain,
  }) {
    // Check if a distribution with this tag already exists
    try {
      const existingDistribution = await this.findDistributionByTag(
        'Name',
        resourceNameBase,
      )
      if (existingDistribution) {
        logger.debug(
          `Found existing CloudFront distribution for ${resourceNameBase}, reusing it`,
        )
        return existingDistribution
      }
    } catch (error) {
      // If there's an error finding the distribution, log it and continue with creation
      logger.debug(`Error checking for existing distribution: ${error.message}`)
    }

    let originDomain, originId, customOriginConfig, originRequestPolicyId
    if (albDnsName) {
      originDomain = albDnsName
      originId = `${resourceNameBase}-alb-origin`
      customOriginConfig = {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: 'http-only',
        OriginSslProtocols: {
          Quantity: 1,
          Items: ['TLSv1.2'],
        },
        OriginReadTimeout: 30,
        OriginKeepaliveTimeout: 5,
      }
      originRequestPolicyId = '216adef6-5c7f-47e4-b989-5492eafa07d3' // AllViewer
    } else if (functionUrl) {
      // Lambda function URLs only support HTTPS
      // Extract only the domain part (no protocol, no trailing slash or path)
      originDomain = functionUrl.replace(/^https?:\/\//, '').replace(/\/.*/, '')
      originId = `${resourceNameBase}-lambda-origin`
      customOriginConfig = {
        HTTPPort: 443,
        HTTPSPort: 443,
        OriginProtocolPolicy: 'https-only',
        OriginSslProtocols: {
          Quantity: 1,
          Items: ['TLSv1.2'],
        },
        OriginReadTimeout: 30,
        OriginKeepaliveTimeout: 5,
      }
      originRequestPolicyId = 'b689b0a8-53d0-40ab-baf2-68738e2966ac' // Managed-CORS-S3Origin
    } else {
      throw new Error(
        'Either albDnsName or functionUrl must be provided for CloudFront origin',
      )
    }

    const distributionConfig = {
      CallerReference: `${resourceNameBase}-${Date.now()}`,
      Comment: `CloudFront distribution for ${resourceNameBase}`,
      DefaultCacheBehavior: {
        TargetOriginId: originId,
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 7,
          Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
          CachedMethods: {
            Quantity: 3,
            Items: ['GET', 'HEAD', 'OPTIONS'],
          },
        },
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        OriginRequestPolicyId: originRequestPolicyId,
        SmoothStreaming: false,
        Compress: true,
      },
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: originId,
            DomainName: originDomain,
            CustomOriginConfig: { ...customOriginConfig },
          },
        ],
      },
      DefaultRootObject: '',
      HttpVersion: 'http2',
      PriceClass: 'PriceClass_All',
      ViewerCertificate:
        certificateArn && domain
          ? {
              ACMCertificateArn: certificateArn,
              SSLSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            }
          : {
              CloudFrontDefaultCertificate: true,
            },
      Aliases:
        certificateArn && domain
          ? {
              Quantity: 1,
              Items: [domain],
            }
          : undefined,
    }

    const command = new CreateDistributionCommand({
      DistributionConfig: distributionConfig,
    })

    try {
      const result = await this.client.send(command)
      logger.debug('CloudFront distribution created successfully')

      // Add a tag to the distribution to avoid duplicates
      try {
        const tagCommand = new TagResourceCommand({
          Resource: result.Distribution.ARN,
          Tags: {
            Items: [
              {
                Key: 'Name',
                Value: resourceNameBase,
              },
            ],
          },
        })
        await this.client.send(tagCommand)
        logger.debug(
          `Added Name tag to CloudFront distribution: ${resourceNameBase}`,
        )
      } catch (tagError) {
        // Log the error but don't fail the entire operation if tagging fails
        logger.debug('Failed to add tag to CloudFront distribution', tagError)
      }

      return result.Distribution
    } catch (error) {
      logger.debug('Failed to create CloudFront distribution', error)
      throw error
    }
  }

  /**
   * Creates a CloudFront distribution with both ALB and Lambda origins for dynamic routing
   * @param {Object} params - The parameters for creating a distribution with dynamic routing
   * @param {string} params.resourceNameBase - Base resource name
   * @param {string} [params.albDnsName] - ALB DNS name
   * @param {string} [params.functionUrl] - Lambda function URL
   * @param {string} [params.functionArn] - CloudFront function ARN for routing (if already created)
   * @param {string} [params.certificateArn] - ACM certificate ARN for custom domain
   * @param {string} [params.domain] - Custom domain name
   * @param {string} [params.scfForwardToken] - Token to forward to the ALB origin
   * @param {string} [params.containerName] - Container name (for Lambda origins)
   * @returns {Promise<Object>} The created CloudFront distribution
   * @note The distribution will be tagged with a 'Name' tag using the resourceNameBase to avoid duplicates
   */
  async createDistributionWithDynamicRouting({
    resourceNameBase,
    albDnsName,
    functionUrl,
    functionArn,
    certificateArn,
    domain,
    scfForwardToken,
    containerName,
  }) {
    // Check if a distribution with this tag already exists
    try {
      const existingDistribution = await this.findDistributionByTag(
        'Name',
        resourceNameBase,
      )
      if (existingDistribution) {
        logger.debug(
          `Found existing CloudFront distribution for ${resourceNameBase}, reusing it`,
        )
        return existingDistribution
      }
    } catch (error) {
      // If there's an error finding the distribution, log it and continue with creation
      logger.debug(`Error checking for existing distribution: ${error.message}`)
    }

    // Create only origins that we have data for
    const originsItems = []
    let defaultOriginId = null

    // Add ALB origin if defined
    if (albDnsName) {
      const albOriginId = `${resourceNameBase}-alb-origin`
      originsItems.push({
        Id: albOriginId,
        DomainName: albDnsName,
        CustomHeaders: {
          Quantity: 1,
          Items: [
            {
              HeaderName: 'x-scf-token',
              HeaderValue: scfForwardToken,
            },
          ],
        },
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: 'http-only',
          OriginSslProtocols: {
            Quantity: 1,
            Items: ['TLSv1.2'],
          },
          OriginReadTimeout: 30,
          OriginKeepaliveTimeout: 5,
        },
      })
      // If ALB is defined, make it the default origin
      defaultOriginId = albOriginId
    }

    // Add Lambda origin if defined
    if (functionUrl) {
      const lambdaDomain = functionUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/.*/, '')
      // Create a unique origin ID for each Lambda container if containerName is provided
      const lambdaOriginId = containerName
        ? `${resourceNameBase}-lambda-${containerName}-origin`
        : `${resourceNameBase}-lambda-origin`
      originsItems.push({
        Id: lambdaOriginId,
        DomainName: lambdaDomain,
        CustomOriginConfig: {
          HTTPPort: 443,
          HTTPSPort: 443,
          OriginProtocolPolicy: 'https-only',
          OriginSslProtocols: {
            Quantity: 1,
            Items: ['TLSv1.2'],
          },
          OriginReadTimeout: 30,
          OriginKeepaliveTimeout: 5,
        },
      })
      // If ALB is not defined but Lambda is, make Lambda the default origin
      if (!defaultOriginId) {
        defaultOriginId = lambdaOriginId
      }
    }

    // Ensure we have at least one origin
    if (originsItems.length === 0) {
      throw new Error(
        'At least one of albDnsName or functionUrl must be provided for CloudFront distribution',
      )
    }

    const distributionConfig = {
      Enabled: true,
      CallerReference: `${resourceNameBase}-${Date.now()}`,
      Comment: `CloudFront distribution with dynamic routing for ${resourceNameBase}`,
      DefaultCacheBehavior: {
        TargetOriginId: defaultOriginId, // Use the determined default origin
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 7,
          Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
          CachedMethods: {
            Quantity: 3,
            Items: ['GET', 'HEAD', 'OPTIONS'],
          },
        },
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // AllViewer
        // OriginRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3', // AllViewer
        SmoothStreaming: false,
        Compress: true,
        FunctionAssociations: functionArn
          ? {
              Quantity: 1,
              Items: [
                {
                  FunctionARN: functionArn,
                  EventType: 'viewer-request',
                },
              ],
            }
          : { Quantity: 0 },
      },
      Origins: {
        Quantity: originsItems.length,
        Items: originsItems,
      },
      DefaultRootObject: '',
      HttpVersion: 'http2',
      PriceClass: 'PriceClass_All',
      ViewerCertificate:
        certificateArn && domain
          ? {
              ACMCertificateArn: certificateArn,
              SSLSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            }
          : {
              CloudFrontDefaultCertificate: true,
            },
      Aliases:
        certificateArn && domain
          ? {
              Quantity: 1,
              Items: [domain],
            }
          : { Quantity: 0 },
    }

    const command = new CreateDistributionCommand({
      DistributionConfig: distributionConfig,
    })

    try {
      const result = await this.client.send(command)
      logger.debug(
        'CloudFront distribution with dynamic routing created successfully',
      )

      // Add a tag to the distribution to avoid duplicates
      try {
        const tagCommand = new TagResourceCommand({
          Resource: result.Distribution.ARN,
          Tags: {
            Items: [
              {
                Key: 'Name',
                Value: resourceNameBase,
              },
            ],
          },
        })
        await this.client.send(tagCommand)
        logger.debug(
          `Added Name tag to CloudFront distribution: ${resourceNameBase}`,
        )
      } catch (tagError) {
        // Log the error but don't fail the entire operation if tagging fails
        logger.debug('Failed to add tag to CloudFront distribution', tagError)
      }

      return result.Distribution
    } catch (error) {
      logger.debug(
        'Failed to create CloudFront distribution with dynamic routing',
        error,
      )
      throw error
    }
  }

  /**
   * Updates the origin of an existing CloudFront distribution if it does not match the desired value
   * @param {Object} params
   * @param {string} params.distributionId
   * @param {string} params.resourceNameBase
   * @param {string} [params.albDnsName]
   * @param {string} [params.functionUrl]
   * @returns {Promise<Object>} The updated CloudFront distribution
   */
  async updateOriginIfNeeded({
    distributionId,
    resourceNameBase,
    albDnsName,
    functionUrl,
  }) {
    const getConfigCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configResult = await this.client.send(getConfigCommand)
    const config = configResult.DistributionConfig
    const eTag = configResult.ETag

    let desiredDomain,
      originId,
      desiredOriginPolicy,
      desiredOriginRequestPolicyId
    if (albDnsName) {
      desiredDomain = albDnsName
      originId = `${resourceNameBase}-alb-origin`
      desiredOriginPolicy = 'http-only'
      desiredOriginRequestPolicyId = '216adef6-5c7f-47e4-b989-5492eafa07d3' // AllViewer
    } else if (functionUrl) {
      // Extract only the domain part (no protocol, no trailing slash or path)
      desiredDomain = functionUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/.*/, '')
      originId = `${resourceNameBase}-lambda-origin`
      desiredOriginPolicy = 'https-only'
      desiredOriginRequestPolicyId = 'b689b0a8-53d0-40ab-baf2-68738e2966ac' // Managed-CORS-S3Origin
    } else {
      throw new Error(
        'Either albDnsName or functionUrl must be provided for CloudFront origin update',
      )
    }

    // Only update if the domain, protocol policy, or OriginRequestPolicyId differs
    const currentOrigin = config.Origins.Items[0]
    if (
      currentOrigin.DomainName !== desiredDomain ||
      currentOrigin.CustomOriginConfig.OriginProtocolPolicy !==
        desiredOriginPolicy ||
      config.DefaultCacheBehavior.OriginRequestPolicyId !==
        desiredOriginRequestPolicyId
    ) {
      currentOrigin.DomainName = desiredDomain
      currentOrigin.Id = originId
      currentOrigin.CustomOriginConfig.OriginProtocolPolicy =
        desiredOriginPolicy
      // Update TargetOriginId and OriginRequestPolicyId in DefaultCacheBehavior as well
      config.DefaultCacheBehavior.TargetOriginId = originId
      config.DefaultCacheBehavior.OriginRequestPolicyId =
        desiredOriginRequestPolicyId

      const updateCommand = new UpdateDistributionCommand({
        Id: distributionId,
        IfMatch: eTag,
        DistributionConfig: config,
      })
      const updateResult = await this.client.send(updateCommand)
      logger.debug('CloudFront distribution origin updated successfully')
      return updateResult.Distribution
    }
    // No update needed
    return null
  }

  /**
   * Updates aliases (custom domain) and viewer certificate for a CloudFront distribution if needed
   * @param {Object} params
   * @param {string} params.distributionId
   * @param {string|null} params.certificateArn
   * @param {string|null} params.domain
   * @returns {Promise<Object|null>} The updated CloudFront distribution, or null if no update was needed
   */
  async updateAliasesIfNeeded({ distributionId, certificateArn, domain }) {
    const getConfigCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configResult = await this.client.send(getConfigCommand)
    const config = configResult.DistributionConfig
    const eTag = configResult.ETag

    // Determine current and desired aliases/cert
    const currentAliases = config.Aliases?.Items || []
    const currentCert = config.ViewerCertificate?.ACMCertificateArn || null
    const desiredAliases = domain ? [domain] : []
    const desiredCert = domain ? certificateArn : null

    let needsUpdate = false
    // Check if aliases changed
    if (
      currentAliases.length !== desiredAliases.length ||
      currentAliases[0] !== desiredAliases[0]
    ) {
      needsUpdate = true
      config.Aliases = domain
        ? { Quantity: 1, Items: [domain] }
        : { Quantity: 0, Items: [] }
    }
    // Check if certificate changed
    if ((desiredCert || null) !== (currentCert || null)) {
      needsUpdate = true
      config.ViewerCertificate =
        domain && certificateArn
          ? {
              ACMCertificateArn: certificateArn,
              SSLSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            }
          : {
              CloudFrontDefaultCertificate: true,
              SSLSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            }
    }
    if (!needsUpdate) return null

    const updateCommand = new UpdateDistributionCommand({
      Id: distributionId,
      IfMatch: eTag,
      DistributionConfig: config,
    })
    const updateResult = await this.client.send(updateCommand)
    logger.debug(
      'CloudFront distribution aliases/certificate updated successfully',
    )
    return updateResult.Distribution
  }

  /**
   * Updates CloudFront distribution origin, aliases, and viewer certificate in a single call if needed
   * @param {Object} params
   * @param {string} params.distributionId
   * @param {string} params.resourceNameBase
   * @param {string|null} params.albDnsName
   * @param {string|null} params.functionUrl
   * @param {string|null} params.certificateArn
   * @param {string|null} params.domain
   * @returns {Promise<Object|null>} The updated distribution, or null if no update was needed
   */
  async updateDistributionIfNeeded({
    distributionId,
    resourceNameBase,
    albDnsName,
    functionUrl,
    certificateArn,
    domain,
  }) {
    const getConfigCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configResult = await this.client.send(getConfigCommand)
    const config = configResult.DistributionConfig
    const eTag = configResult.ETag

    // --- ORIGIN LOGIC ---
    let desiredDomain,
      originId,
      desiredOriginPolicy,
      desiredOriginRequestPolicyId
    if (albDnsName) {
      desiredDomain = albDnsName
      originId = `${resourceNameBase}-alb-origin`
      desiredOriginPolicy = 'http-only'
      desiredOriginRequestPolicyId = 'b689b0a8-53d0-40ab-baf2-68738e2966ac'
      // desiredOriginRequestPolicyId = '216adef6-5c7f-47e4-b989-5492eafa07d3' // AllViewer
    } else if (functionUrl) {
      desiredDomain = functionUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/.*/, '')
      originId = `${resourceNameBase}-lambda-origin`
      desiredOriginPolicy = 'https-only'
      desiredOriginRequestPolicyId = 'b689b0a8-53d0-40ab-baf2-68738e2966ac' // Managed-CORS-S3Origin
    } else {
      throw new Error(
        'Either albDnsName or functionUrl must be provided for CloudFront origin update',
      )
    }

    const currentOrigin = config.Origins.Items[0]
    let needsUpdate = false
    if (
      currentOrigin.DomainName !== desiredDomain ||
      currentOrigin.CustomOriginConfig.OriginProtocolPolicy !==
        desiredOriginPolicy ||
      config.DefaultCacheBehavior.OriginRequestPolicyId !==
        desiredOriginRequestPolicyId
    ) {
      currentOrigin.DomainName = desiredDomain
      currentOrigin.Id = originId
      currentOrigin.CustomOriginConfig.OriginProtocolPolicy =
        desiredOriginPolicy
      config.DefaultCacheBehavior.TargetOriginId = originId
      config.DefaultCacheBehavior.OriginRequestPolicyId =
        desiredOriginRequestPolicyId
      needsUpdate = true
    }

    // --- ALIASES & CERT LOGIC ---
    const currentAliases = config.Aliases?.Items || []
    const currentCert = config.ViewerCertificate?.ACMCertificateArn || null
    const desiredAliases = domain ? [domain] : []
    const desiredCert = domain ? certificateArn : null
    if (
      currentAliases.length !== desiredAliases.length ||
      currentAliases[0] !== desiredAliases[0]
    ) {
      config.Aliases = domain
        ? { Quantity: 1, Items: [domain] }
        : { Quantity: 0, Items: [] }
      needsUpdate = true
    }
    if (
      (desiredCert || null) !== (currentCert || null) ||
      !config.ViewerCertificate
    ) {
      config.ViewerCertificate =
        domain && certificateArn
          ? {
              ACMCertificateArn: certificateArn,
              SSLSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            }
          : {
              CloudFrontDefaultCertificate: true,
              SSLSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            }
      needsUpdate = true
    }

    if (!needsUpdate) return null

    const updateCommand = new UpdateDistributionCommand({
      Id: distributionId,
      IfMatch: eTag,
      DistributionConfig: config,
    })
    const updateResult = await this.client.send(updateCommand)
    logger.debug(
      'CloudFront distribution updated (origin, aliases, cert) successfully',
    )
    return updateResult.Distribution
  }

  /**
   * Gets a CloudFront distribution by ID
   * @param {string} distributionId - The ID of the CloudFront distribution
   * @returns {Promise<Object>} The CloudFront distribution
   */
  async getDistribution(distributionId) {
    try {
      const command = new GetDistributionCommand({
        Id: distributionId,
      })
      const result = await this.client.send(command)
      return result.Distribution
    } catch (error) {
      logger.debug(
        `Failed to get CloudFront distribution ${distributionId}`,
        error,
      )
      throw error
    }
  }

  /**
   * Finds a CloudFront distribution by tag
   * @param {string} tagKey - The tag key to search for
   * @param {string} tagValue - The tag value to search for
   * @returns {Promise<Object|null>} The CloudFront distribution if found, null otherwise
   */
  async findDistributionByTag(tagKey, tagValue) {
    try {
      logger.debug(
        `Searching for CloudFront distribution with tag ${tagKey}=${tagValue}`,
      )

      // List all distributions
      const listCommand = new ListDistributionsCommand({})
      const listResult = await this.client.send(listCommand)

      if (
        !listResult.DistributionList ||
        !listResult.DistributionList.Items ||
        listResult.DistributionList.Items.length === 0
      ) {
        logger.debug('No CloudFront distributions found')
        return null
      }

      // Check each distribution's tags
      for (const distribution of listResult.DistributionList.Items) {
        try {
          const tagsCommand = new ListTagsForResourceCommand({
            Resource: distribution.ARN,
          })
          const tagsResult = await this.client.send(tagsCommand)

          if (tagsResult.Tags && tagsResult.Tags.Items) {
            const matchingTag = tagsResult.Tags.Items.find(
              (tag) => tag.Key === tagKey && tag.Value === tagValue,
            )

            if (matchingTag) {
              logger.debug(
                `Found CloudFront distribution with tag ${tagKey}=${tagValue}: ${distribution.Id}`,
              )
              // Get the full distribution details
              return await this.getDistribution(distribution.Id)
            }
          }
        } catch (tagError) {
          // Continue checking other distributions if we can't get tags for this one
          logger.debug(
            `Failed to get tags for distribution ${distribution.Id}`,
            tagError,
          )
        }
      }

      logger.debug(
        `No CloudFront distribution found with tag ${tagKey}=${tagValue}`,
      )
      return null
    } catch (error) {
      logger.debug('Failed to search for CloudFront distribution by tag', error)
      return null
    }
  }

  /**
   * Waits for a CloudFront distribution to be deployed
   * @param {string} distributionId - The ID of the CloudFront distribution
   * @returns {Promise<void>}
   */
  async waitForDistributionDeployed(distributionId) {
    try {
      logger.debug(
        `Waiting for CloudFront distribution ${distributionId} to be deployed`,
      )

      let isDeployed = false
      let retries = 0
      const maxRetries = 60 // 30 minutes with 30 second intervals

      while (!isDeployed && retries < maxRetries) {
        const distribution = await this.getDistribution(distributionId)

        if (distribution.Status === 'Deployed') {
          isDeployed = true
          logger.debug(`CloudFront distribution ${distributionId} is deployed`)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 30000))
          retries++
          logger.debug(
            `Waiting for CloudFront distribution ${distributionId} to be deployed (${retries}/${maxRetries})`,
          )
        }
      }

      if (!isDeployed) {
        throw new Error(
          `Timed out waiting for CloudFront distribution ${distributionId} to be deployed`,
        )
      }
    } catch (error) {
      logger.debug(
        `Failed to wait for CloudFront distribution ${distributionId}`,
        error,
      )
      throw error
    }
  }

  /**
   * Creates or updates a CloudFront Function
   * @param {Object} params - The parameters
   * @param {string} params.name - Function name
   * @param {string} params.code - The JavaScript function code
   * @param {string} [params.kvStoreARN] - Optional ARN of the KV store to associate with the function
   * @returns {Promise<Object>} Function information including ARN
   */
  async createOrUpdateFunction({ name, code, kvStoreARN }) {
    try {
      // Check if function exists
      try {
        const getCommand = new GetFunctionCommand({
          Name: name,
        })
        const existingFunction = await this.client.send(getCommand)

        // Update existing function
        const updateCommand = new UpdateFunctionCommand({
          Name: name,
          IfMatch: existingFunction.ETag,
          FunctionConfig: {
            Comment: `Routing function for ${name}`,
            Runtime: 'cloudfront-js-2.0',
            KeyValueStoreAssociations: kvStoreARN
              ? {
                  Quantity: 1,
                  Items: [{ KeyValueStoreARN: kvStoreARN }],
                }
              : undefined,
          },
          FunctionCode: Buffer.from(code),
        })

        const updateResult = await this.client.send(updateCommand)

        // Publish the function after updating
        const publishCommand = new PublishFunctionCommand({
          Name: name,
          IfMatch: updateResult.ETag,
        })
        await this.client.send(publishCommand)

        logger.debug(`CloudFront Function ${name} updated and published`)
        return {
          FunctionSummary: {
            Name: updateResult.FunctionSummary.Name,
            ARN: updateResult.FunctionSummary.FunctionMetadata.FunctionARN,
          },
        }
      } catch (error) {
        if (error.name === 'NoSuchFunctionExists') {
          // Create new function
          const createCommand = new CreateFunctionCommand({
            Name: name,
            FunctionConfig: {
              Comment: `Routing function for ${name}`,
              Runtime: 'cloudfront-js-2.0',
              KeyValueStoreAssociations: kvStoreARN
                ? {
                    Quantity: 1,
                    Items: [{ KeyValueStoreARN: kvStoreARN }],
                  }
                : undefined,
            },
            FunctionCode: Buffer.from(code),
          })

          const createResult = await this.client.send(createCommand)

          // Publish the function after creation
          const publishCommand = new PublishFunctionCommand({
            Name: name,
            IfMatch: createResult.ETag,
          })
          await this.client.send(publishCommand)

          logger.debug(`CloudFront Function ${name} created and published`)
          return {
            FunctionSummary: {
              Name: createResult.FunctionSummary.Name,
              ARN: createResult.FunctionSummary.FunctionMetadata.FunctionARN,
            },
          }
        }
        throw error
      }
    } catch (error) {
      logger.debug(`Failed to create/update CloudFront Function ${name}`, error)
      throw error
    }
  }

  /**
   * Updates only the KV store association for an existing CloudFront Function
   * without changing the function code
   *
   * @param {Object} params - The parameters
   * @param {string} params.name - Function name
   * @param {string} params.kvStoreARN - ARN of the KV store to associate with the function
   * @returns {Promise<Object>} Function information including ARN
   */
  async updateFunctionKvAssociation({ name, kvStoreARN }) {
    try {
      // Get the current function
      const getCommand = new DescribeFunctionCommand({
        Name: name,
      })
      const existingFunction = await this.client.send(getCommand)

      // Check if KV association already matches
      const currentAssociations =
        existingFunction.FunctionSummary?.FunctionConfig
          ?.KeyValueStoreAssociations
      const currentKvArn = currentAssociations?.Items?.[0]?.KeyValueStoreARN

      if (currentKvArn === kvStoreARN) {
        logger.debug(
          `CloudFront Function ${name} already associated with KV store ${kvStoreARN}`,
        )
        return {
          FunctionSummary: {
            Name: name,
            ARN: existingFunction.FunctionSummary?.FunctionMetadata
              ?.FunctionARN,
          },
        }
      }

      const functionCode = await this.client.send(
        new GetFunctionCommand({
          Name: name,
        }),
      )

      // Update only the KV association, preserving the existing code
      const updateCommand = new UpdateFunctionCommand({
        Name: name,
        IfMatch: existingFunction.ETag,
        FunctionConfig: {
          Comment: existingFunction.FunctionSummary.FunctionConfig.Comment,
          Runtime: existingFunction.FunctionSummary.FunctionConfig.Runtime,
          KeyValueStoreAssociations: {
            Quantity: 1,
            Items: [{ KeyValueStoreARN: kvStoreARN }],
          },
        },
        // Keep the existing function code
        FunctionCode: functionCode.FunctionCode,
      })

      const updateResult = await this.client.send(updateCommand)

      // Publish the function after updating
      const publishCommand = new PublishFunctionCommand({
        Name: name,
        IfMatch: updateResult.ETag,
      })
      await this.client.send(publishCommand)

      logger.debug(
        `CloudFront Function ${name} KV store association updated to ${kvStoreARN}`,
      )
      return {
        FunctionSummary: {
          Name: name,
          ARN: existingFunction.FunctionMetadata.FunctionARN,
        },
      }
    } catch (error) {
      logger.debug(
        `Failed to update KV association for CloudFront Function ${name}`,
        error,
      )
      throw error
    }
  }

  /**
   * Associates a CloudFront Function with a distribution's default cache behavior
   * @param {Object} params - The parameters
   * @param {string} params.distributionId - The CloudFront distribution ID
   * @param {string} params.functionArn - The CloudFront Function ARN
   * @returns {Promise<Object>} The updated distribution
   */
  async associateFunctionWithDistribution({ distributionId, functionArn }) {
    const getConfigCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configResult = await this.client.send(getConfigCommand)
    const config = configResult.DistributionConfig
    const eTag = configResult.ETag

    // Check if function association already exists
    const currentAssociations = config.DefaultCacheBehavior
      .FunctionAssociations || { Quantity: 0 }
    let needsUpdate = true

    if (currentAssociations.Quantity > 0) {
      const existingAssociation = currentAssociations.Items.find(
        (item) =>
          item.FunctionARN === functionArn &&
          item.EventType === 'viewer-request',
      )
      if (existingAssociation) {
        needsUpdate = false
      }
    }

    if (needsUpdate) {
      // Update the function associations
      config.DefaultCacheBehavior.FunctionAssociations = {
        Quantity: 1,
        Items: [
          {
            FunctionARN: functionArn,
            EventType: 'viewer-request',
          },
        ],
      }

      const updateCommand = new UpdateDistributionCommand({
        Id: distributionId,
        IfMatch: eTag,
        DistributionConfig: config,
      })

      const updateResult = await this.client.send(updateCommand)
      logger.debug(
        'CloudFront Function associated with distribution successfully',
      )
      return updateResult.Distribution
    }

    logger.debug('CloudFront Function already associated with distribution')
    return null
  }

  /**
   * Deletes a CloudFront distribution
   * @param {string} distributionId - The ID of the CloudFront distribution
   * @returns {Promise<void>}
   */
  async deleteDistribution(distributionId) {
    const getConfigCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configResult = await this.client.send(getConfigCommand)
    const config = configResult.DistributionConfig
    const eTag = configResult.ETag

    config.Enabled = false
    const updateCommand = new UpdateDistributionCommand({
      Id: distributionId,
      IfMatch: eTag,
      DistributionConfig: config,
    })
    await this.client.send(updateCommand)

    await this.waitForDistributionDeployed(distributionId)

    const getConfigAgainCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configAgainResult = await this.client.send(getConfigAgainCommand)
    const newETag = configAgainResult.ETag

    const deleteCommand = new DeleteDistributionCommand({
      Id: distributionId,
      IfMatch: newETag,
    })
    await this.client.send(deleteCommand)
    logger.debug(
      `CloudFront distribution ${distributionId} deleted successfully`,
    )
  }

  /**
   * Gets a CloudFront function by name
   * @param {string} functionName - The name of the CloudFront function
   * @returns {Promise<Object|null>} The function or null if it doesn't exist
   */
  async getFunction(functionName) {
    try {
      const getCommand = new GetFunctionCommand({
        Name: functionName,
      })
      const functionData = await this.client.send(getCommand)
      return functionData
    } catch (error) {
      if (error.name === 'NoSuchFunctionExists') {
        return null
      }
      logger.debug(`Failed to get CloudFront function ${functionName}`, error)
      throw error
    }
  }

  /**
   * Deletes a CloudFront function
   * @param {string} functionName - The name of the CloudFront function
   * @returns {Promise<void>}
   */
  async deleteFunction(functionName) {
    try {
      // First get the function to get its ETag
      const getCommand = new GetFunctionCommand({
        Name: functionName,
      })

      try {
        const existingFunction = await this.client.send(getCommand)

        // Delete the function
        const deleteCommand = new DeleteFunctionCommand({
          Name: functionName,
          IfMatch: existingFunction.ETag,
        })

        await this.client.send(deleteCommand)
        logger.debug(`CloudFront function ${functionName} deleted successfully`)
      } catch (error) {
        if (error.name === 'NoSuchFunctionExists') {
          logger.debug(
            `CloudFront function ${functionName} does not exist, nothing to delete`,
          )
          return
        }
        throw error
      }
    } catch (error) {
      logger.debug(
        `Failed to delete CloudFront function ${functionName}`,
        error,
      )
      throw error
    }
  }

  /**
   * Adds a new origin to an existing CloudFront distribution
   * @param {Object} params
   * @param {string} params.distributionId - The CloudFront distribution ID
   * @param {string} params.resourceNameBase - Base resource name
   * @param {string} [params.albDnsName] - ALB DNS name to add
   * @param {string} [params.functionUrl] - Lambda function URL to add
   * @param {boolean} [params.setAsDefault=false] - Whether to set the new origin as the default
   * @param {string} [params.containerName] - Container name (for Lambda origins)
   * @returns {Promise<Object|null>} The updated distribution, or null if no update was needed
   */
  async addOriginToDistribution({
    distributionId,
    resourceNameBase,
    albDnsName,
    functionUrl,
    scfForwardToken,
    setAsDefault = false,
    containerName,
  }) {
    if (!albDnsName && !functionUrl) {
      throw new Error(
        'Either albDnsName or functionUrl must be provided to add an origin',
      )
    }

    // Get current distribution configuration
    const getConfigCommand = new GetDistributionConfigCommand({
      Id: distributionId,
    })
    const configResult = await this.client.send(getConfigCommand)
    const config = configResult.DistributionConfig
    const eTag = configResult.ETag

    // Determine the new origin details
    let originId, domainName, originProtocolPolicy
    if (albDnsName) {
      originId = `${resourceNameBase}-alb-origin`
      domainName = albDnsName
      originProtocolPolicy = 'http-only'
    } else {
      // Create a unique origin ID for each Lambda container if containerName is provided
      originId = containerName
        ? `${resourceNameBase}-lambda-${containerName}-origin`
        : `${resourceNameBase}-lambda-origin`
      domainName = functionUrl.replace(/^https?:\/\//, '').replace(/\/.*/, '')
      originProtocolPolicy = 'https-only'
    }

    // Check if the origin already exists
    const existingOrigins = config.Origins.Items || []
    const originExists = existingOrigins.some(
      (origin) => origin.Id === originId || origin.DomainName === domainName,
    )

    if (originExists) {
      logger.debug(`Origin ${originId} already exists in the distribution`)
      return null
    }

    // Create the new origin configuration with all required fields
    const newOrigin = {
      Id: originId,
      DomainName: domainName,
      OriginPath: '',
      CustomHeaders: {
        Quantity: 0,
      },
      CustomOriginConfig: {
        HTTPPort: originProtocolPolicy === 'http-only' ? 80 : 443,
        HTTPSPort: 443,
        OriginProtocolPolicy: originProtocolPolicy,
        OriginSslProtocols: {
          Quantity: 1,
          Items: ['TLSv1.2'],
        },
        OriginReadTimeout: 30,
        OriginKeepaliveTimeout: 5,
      },
      ConnectionAttempts: 3,
      ConnectionTimeout: 10,
      OriginShield: {
        Enabled: false,
      },
      OriginAccessControlId: '',
      OriginCustomHeaders: {
        Quantity: 0,
        Items: [],
      },
    }

    if (albDnsName) {
      newOrigin.CustomHeaders.Quantity = 1
      newOrigin.CustomHeaders.Items = [
        {
          HeaderName: 'x-scf-token',
          HeaderValue: scfForwardToken,
        },
      ]
    }

    // Add the new origin to the configuration
    existingOrigins.push(newOrigin)
    config.Origins.Quantity = existingOrigins.length
    config.Origins.Items = existingOrigins

    // Set as default target origin if requested
    if (setAsDefault) {
      config.DefaultCacheBehavior.TargetOriginId = originId

      // // Update origin request policy if needed
      // if (albDnsName) {
      //   config.DefaultCacheBehavior.OriginRequestPolicyId = '216adef6-5c7f-47e4-b989-5492eafa07d3' // AllViewer
      // } else if (functionUrl) {
      config.DefaultCacheBehavior.OriginRequestPolicyId =
        'b689b0a8-53d0-40ab-baf2-68738e2966ac' // Managed-CORS-S3Origin
      // }
    }

    // Log the Origins configuration for debugging
    logger.debug(
      `Origins configuration for update: ${JSON.stringify(config.Origins, null, 2)}`,
    )

    // Update the distribution
    const updateCommand = new UpdateDistributionCommand({
      Id: distributionId,
      IfMatch: eTag,
      DistributionConfig: config,
    })

    try {
      const updateResult = await this.client.send(updateCommand)
      logger.debug(
        `Origin ${originId} added to CloudFront distribution successfully`,
      )
      return updateResult.Distribution
    } catch (error) {
      logger.debug(
        `Failed to add origin ${originId} to CloudFront distribution`,
        error,
      )
      throw error
    }
  }
}
