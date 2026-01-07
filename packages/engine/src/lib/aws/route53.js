import {
  Route53Client as AwsSdkRoute53Client,
  ChangeAction,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const logger = log.get('aws:route53')

export class AwsRoute53Client {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkRoute53Client({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  /**
   * Finds or creates a hosted zone in AWS Route53
   * @param {string} domain - The domain name to find or create a hosted zone for
   * @returns {Promise<string>} The hosted zone ID
   */
  async findOrCreateHostedZone(domain) {
    // Split domain into parts to find parent domains
    const domainParts = domain.split('.')
    const possibleDomains = []

    // Generate all possible parent domains
    // e.g., for test.example.com: [test.example.com, example.com]
    for (let i = 0; i < domainParts.length - 1; i++) {
      possibleDomains.push(domainParts.slice(i).join('.'))
    }

    // List all hosted zones
    const listHostedZonesResponse = await this.client.send(
      new ListHostedZonesByNameCommand({}),
    )

    // Find the best matching hosted zone
    // We'll sort by length to prefer more specific matches
    const matchingZone = listHostedZonesResponse.HostedZones.filter((zone) => {
      const zoneName = zone.Name.endsWith('.')
        ? zone.Name.slice(0, -1)
        : zone.Name
      return possibleDomains.includes(zoneName)
    }).sort((a, b) => b.Name.length - a.Name.length)[0]

    if (matchingZone) {
      logger.debug(
        `Found matching hosted zone: ${matchingZone.Name} for domain: ${domain} with id: ${matchingZone.Id}`,
      )
      return matchingZone.Id
    }

    // If no matching zone is found, throw an error
    const apexDomain = domainParts.slice(-2).join('.')
    logger.debug(
      `No matching hosted zone found for domain: ${domain}. Please create a hosted zone for ${apexDomain} in AWS Route53 first.`,
    )
    return null
  }

  /**
   * Creates a record in AWS Route53 if it doesn't exist
   * @param {string} hostedZoneId - The hosted zone ID
   * @param {Object} resourceRecord - The resource record to create
   */
  async createRecordIfNotExists(hostedZoneId, resourceRecord) {
    const listResourceRecordSetsResponse = await this.client.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    )

    const existingRecord =
      listResourceRecordSetsResponse.ResourceRecordSets?.find((record) => {
        record.Name === `${resourceRecord?.Name}.` &&
          record.Type === resourceRecord?.Type
      })

    if (existingRecord) {
      return
    }

    try {
      logger.debug({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: ChangeAction.CREATE,
              ResourceRecordSet: {
                Name: resourceRecord.Name,
                Type: resourceRecord.Type,
                TTL: 300,
                ResourceRecords: [{ Value: resourceRecord.Value }],
              },
            },
          ],
        },
      })
      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: ChangeAction.CREATE,
                ResourceRecordSet: {
                  Name: resourceRecord.Name,
                  Type: resourceRecord.Type,
                  TTL: 300,
                  ResourceRecords: [{ Value: resourceRecord.Value }],
                },
              },
            ],
          },
        }),
      )
    } catch (error) {
      return
    }
  }

  /**
   * Deletes an AWS ALB alias record from Route 53
   * @param {Object} options - Options object
   * @param {string} options.loadBalancerDNSName - The DNS name of the load balancer
   * @param {string} options.loadBalancerZoneId - The zone ID of the load balancer
   * @param {string} options.domain - The domain name to delete the alias record for
   */
  async deleteAlbAliasRecord({
    loadBalancerDNSName,
    loadBalancerZoneId,
    domain,
  }) {
    const hostedZoneId = await this.findOrCreateHostedZone(domain)

    // If no hosted zone is found, we can't delete the record
    if (!hostedZoneId) {
      logger.debug(
        `No hosted zone found for domain: ${domain}. Skipping deletion of ALB alias record.`,
      )
      return
    }

    const hostedZoneIdWithoutTrailingSlash = hostedZoneId.split('/').pop()

    const listResourceRecordSetsResponse = await this.client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneIdWithoutTrailingSlash,
      }),
    )
    const existingRecord =
      listResourceRecordSetsResponse.ResourceRecordSets.find(
        (record) =>
          record.Name === `${domain}.` &&
          record.Type === 'A' &&
          record.AliasTarget.DNSName === `${loadBalancerDNSName}.`,
      )
    if (existingRecord) {
      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneIdWithoutTrailingSlash,
          ChangeBatch: {
            Changes: [
              {
                Action: ChangeAction.DELETE,
                ResourceRecordSet: {
                  Name: existingRecord.Name,
                  Type: existingRecord.Type,
                  AliasTarget: {
                    DNSName: loadBalancerDNSName,
                    HostedZoneId: loadBalancerZoneId,
                    EvaluateTargetHealth: false,
                  },
                },
              },
            ],
          },
        }),
      )
    }
  }

  decodeWildcardDomain(domain) {
    // Converts AWS's encoded wildcard (\052.) to *.
    return domain.replace(/^\\052\./, '*.')
  }

  /**
   * Adds an AWS ALB alias record to Route 53
   * @param {Object} options - Options object
   * @param {string} options.loadBalancerDNSName - The DNS name of the load balancer
   * @param {string} options.loadBalancerZoneId - The zone ID of the load balancer
   * @param {string} options.domain - The domain name to add the alias record for
   */
  async addAlbAliasRecord({ loadBalancerDNSName, loadBalancerZoneId, domain }) {
    const hostedZoneId = await this.findOrCreateHostedZone(domain)

    // If no hosted zone is found, we can't add the record, throw an error
    if (!hostedZoneId) {
      throw new ServerlessError(
        `No AWS Route53 hosted zone found for domain: ${domain}. Please create a hosted zone for ${domain} in AWS Route53 first and try again.`,
        'AWS_ROUTE53_MISSING_HOSTED_ZONE',
      )
    }

    const hostedZoneIdWithoutTrailingSlash = hostedZoneId.split('/').pop()
    const listResourceRecordSetsResponse = await this.client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneIdWithoutTrailingSlash,
      }),
    )
    const existingRecord =
      listResourceRecordSetsResponse.ResourceRecordSets.find(
        (record) =>
          this.decodeWildcardDomain(record.Name) === `${domain}.` &&
          record.Type === 'A',
      )
    if (existingRecord) {
      logger.debug(`ALB alias record already exists for domain: ${domain}.`)
    } else {
      logger.debug(
        `Creating ALB alias record for domain: ${domain} to hosted zone: ${hostedZoneId}, load balancer: ${loadBalancerDNSName}, zone id: ${loadBalancerZoneId}`,
      )
      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneIdWithoutTrailingSlash,
          ChangeBatch: {
            Changes: [
              {
                Action: ChangeAction.CREATE,
                ResourceRecordSet: {
                  Name: domain,
                  Type: 'A',
                  AliasTarget: {
                    DNSName: loadBalancerDNSName,
                    HostedZoneId: loadBalancerZoneId,
                    EvaluateTargetHealth: false,
                  },
                },
              },
            ],
          },
        }),
      )
    }

    /**
     * If the provided domain is a naked domain (i.e. does not contain a subdomain), auto create an ALB alias record for the www subdomain
     * pointing to the same load balancer.
     */
    if (domain.split('.').length === 2) {
      const wwwDomain = `www.${domain}`
      // Check if an alias record for the www domain already exists
      const listWwwResponse = await this.client.send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: hostedZoneIdWithoutTrailingSlash,
        }),
      )
      const existingWwwRecord = listWwwResponse.ResourceRecordSets.find(
        (record) => record.Name === `${wwwDomain}.` && record.Type === 'A',
      )
      if (existingWwwRecord) {
        logger.debug(
          `ALB alias record already exists for www domain: ${wwwDomain}. Skipping creation.`,
        )
      } else {
        logger.debug(
          `Auto-creating ALB alias record for www domain: ${wwwDomain}, load balancer: ${loadBalancerDNSName}, zone id: ${loadBalancerZoneId}`,
        )
        await this.client.send(
          new ChangeResourceRecordSetsCommand({
            HostedZoneId: hostedZoneIdWithoutTrailingSlash,
            ChangeBatch: {
              Changes: [
                {
                  Action: ChangeAction.CREATE,
                  ResourceRecordSet: {
                    Name: wwwDomain,
                    Type: 'A',
                    AliasTarget: {
                      DNSName: loadBalancerDNSName,
                      HostedZoneId: loadBalancerZoneId,
                      EvaluateTargetHealth: false,
                    },
                  },
                },
              ],
            },
          }),
        )
      }
    }

    return {
      hostedZoneId,
    }
  }

  /**
   * Adds a CloudFront alias record to Route 53 for the given domain.
   * @param {Object} options - Options object
   * @param {string} options.distributionDomainName - The domain name of the CloudFront distribution (e.g. d123.cloudfront.net)
   * @param {string} options.domain - The custom domain to point to CloudFront
   * @returns {Promise<Object>} - Returns an object containing the hostedZoneId
   */
  async addCloudFrontAliasRecord({ distributionDomainName, domain }) {
    const hostedZoneId = await this.findOrCreateHostedZone(domain)
    if (!hostedZoneId) {
      throw new ServerlessError(
        `No AWS Route53 hosted zone found for domain: ${domain}. Please create a hosted zone for ${domain} in AWS Route53 first and try again.`,
        'AWS_ROUTE53_MISSING_HOSTED_ZONE',
      )
    }
    const hostedZoneIdWithoutTrailingSlash = hostedZoneId.split('/').pop()
    const listResourceRecordSetsResponse = await this.client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneIdWithoutTrailingSlash,
      }),
    )
    const existingRecord =
      listResourceRecordSetsResponse.ResourceRecordSets.find(
        (record) => record.Name === `${domain}.` && record.Type === 'A',
      )
    if (existingRecord) {
      logger.debug(
        `CloudFront alias record already exists for domain: ${domain}.`,
      )
    } else {
      logger.debug(
        `Creating CloudFront alias record for domain: ${domain} to CloudFront distribution: ${distributionDomainName}`,
      )
      // CloudFront distributions use a fixed hosted zone ID for alias records
      // See: https://docs.aws.amazon.com/general/latest/gr/cf_domain_name.html
      const CLOUDFRONT_HOSTED_ZONE_ID = 'Z2FDTNDATAQYW2'
      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneIdWithoutTrailingSlash,
          ChangeBatch: {
            Changes: [
              {
                Action: ChangeAction.CREATE,
                ResourceRecordSet: {
                  Name: domain,
                  Type: 'A',
                  AliasTarget: {
                    DNSName: distributionDomainName,
                    HostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
                    EvaluateTargetHealth: false,
                  },
                },
              },
            ],
          },
        }),
      )
    }
    return {
      hostedZoneId,
    }
  }

  /**
   * Deletes a CloudFront alias record from Route 53
   * @param {Object} options - Options object
   * @param {string} options.distributionDomainName - The CloudFront distribution domain name
   * @param {string} options.domain - The domain name to delete the alias record for
   */
  async deleteCloudFrontAliasRecord({ distributionDomainName, domain }) {
    const hostedZoneId = await this.findOrCreateHostedZone(domain)
    if (!hostedZoneId) {
      logger.debug(
        `No hosted zone found for domain: ${domain}. Skipping deletion of CloudFront alias record.`,
      )
      return
    }
    const hostedZoneIdWithoutTrailingSlash = hostedZoneId.split('/').pop()
    const listResourceRecordSetsResponse = await this.client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneIdWithoutTrailingSlash,
      }),
    )
    const existingRecord =
      listResourceRecordSetsResponse.ResourceRecordSets.find(
        (record) =>
          record.Name === `${domain}.` &&
          record.Type === 'A' &&
          record.AliasTarget &&
          record.AliasTarget.DNSName === `${distributionDomainName}.`,
      )
    if (existingRecord) {
      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneIdWithoutTrailingSlash,
          ChangeBatch: {
            Changes: [
              {
                Action: ChangeAction.DELETE,
                ResourceRecordSet: existingRecord,
              },
            ],
          },
        }),
      )
      logger.debug(
        `Deleted CloudFront alias record for domain: ${domain} -> ${distributionDomainName}`,
      )
    }
  }
}
