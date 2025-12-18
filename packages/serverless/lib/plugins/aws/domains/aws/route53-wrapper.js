import Globals from '../globals.js'
import DomainConfig from '../models/domain-config.js'
import Logging from '../logging.js'
import AWS from 'aws-sdk'
import { getAWSPagedResults } from '../utils.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

// Define constants that were imported from v3 SDK
const ChangeAction = {
  UPSERT: 'UPSERT',
  DELETE: 'DELETE',
}

const RRType = {
  A: 'A',
  AAAA: 'AAAA',
}

class Route53Wrapper {
  constructor(credentials, region) {
    // not null and not undefined
    const serviceEndpoint = Globals.getServiceEndpoint('route53')
    const config = {
      region: region || Globals.getRegion(),
      endpoint: serviceEndpoint,
      ...Globals.getRetryStrategy(),
      ...Globals.getRequestHandler(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.region = config.region
    this.route53 = new AWS.Route53(config)
  }

  /**
   * Gets Route53 HostedZoneId from user or from AWS
   * @param {DomainConfig} domain
   * @param {boolean} isHostedZonePrivate
   * @returns {Promise<string>}
   */
  async getRoute53HostedZoneId(domain, isHostedZonePrivate) {
    if (domain.hostedZoneId) {
      Logging.logInfo(`Selected specific hostedZoneId ${domain.hostedZoneId}`)
      return domain.hostedZoneId
    }

    const isPrivateDefined = typeof isHostedZonePrivate !== 'undefined'
    if (isPrivateDefined) {
      const zoneTypeString = isHostedZonePrivate ? 'private' : 'public'
      Logging.logInfo(`Filtering to only ${zoneTypeString} zones.`)
    }

    let hostedZones = []
    try {
      hostedZones = await getAWSPagedResults(
        this.route53,
        'listHostedZones',
        'HostedZones',
        'Marker',
        'NextMarker',
        {},
      )
      Logging.logInfo(
        `Found hosted zones list: ${hostedZones.map((zone) => zone.Name)}.`,
      )
    } catch (err) {
      throw new ServerlessError(
        `Unable to list hosted zones in Route53.\n${err.message}`,
        ServerlessErrorCodes.route53.ROUTE53_LIST_HOSTED_ZONES_FAILED,
        { originalMessage: err.message },
      )
    }

    // removing the first part of the domain name, api.test.com => test.com
    const domainNameHost = domain.givenDomainName.substring(
      domain.givenDomainName.indexOf('.') + 1,
    )
    const targetHostedZone = hostedZones
      .filter((hostedZone) => {
        return (
          !isPrivateDefined ||
          isHostedZonePrivate === hostedZone.Config.PrivateZone
        )
      })
      .filter((hostedZone) => {
        const hostedZoneName = hostedZone.Name.replace(/\.$/, '')
        return (
          domain.givenDomainName === hostedZoneName ||
          domainNameHost.endsWith(hostedZoneName)
        )
      })
      .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
      .shift()

    if (targetHostedZone) {
      return targetHostedZone.Id.replace('/hostedzone/', '')
    } else {
      throw new ServerlessError(
        `Could not find hosted zone '${domain.givenDomainName}'`,
        ServerlessErrorCodes.route53.ROUTE53_HOSTED_ZONE_NOT_FOUND,
      )
    }
  }

  /**
   * Checks if a domain is managed by Route53 by finding its hosted zone
   * @param {string} domainName The domain name to check
   * @returns {Promise<boolean>} True if domain is managed by Route53
   */
  async isDomainManagedByRoute53(domainName) {
    try {
      const hostedZones = await getAWSPagedResults(
        this.route53,
        'listHostedZones',
        'HostedZones',
        'Marker',
        'NextMarker',
        {},
      )

      // removing the first part of the domain name, api.test.com => test.com
      const domainNameHost = domainName.substring(domainName.indexOf('.') + 1)

      const hasMatchingZone = hostedZones.some((hostedZone) => {
        const hostedZoneName = hostedZone.Name.replace(/\.$/, '')
        return (
          domainName === hostedZoneName ||
          domainNameHost.endsWith(hostedZoneName)
        )
      })

      return hasMatchingZone
    } catch (err) {
      Logging.logWarning(`Unable to check Route53 hosted zones: ${err.message}`)
      return false
    }
  }

  /**
   * Creates DNS validation records for ACM certificate validation
   * @param {Array} validationRecords Array of validation record objects
   * @param {string} domainName The domain name being validated
   * @returns {Promise<void>}
   */
  async createCertificateValidationRecords(validationRecords, domainName) {
    try {
      const hostedZones = await getAWSPagedResults(
        this.route53,
        'listHostedZones',
        'HostedZones',
        'Marker',
        'NextMarker',
        {},
      )

      for (const record of validationRecords) {
        // Find the appropriate hosted zone for this validation record
        const recordDomain = record.Domain || domainName
        const domainHost = recordDomain.substring(recordDomain.indexOf('.') + 1)

        const targetHostedZone = hostedZones
          .filter((hostedZone) => {
            const hostedZoneName = hostedZone.Name.replace(/\.$/, '')
            return (
              recordDomain === hostedZoneName ||
              domainHost.endsWith(hostedZoneName)
            )
          })
          .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
          .shift()

        if (!targetHostedZone) {
          throw new ServerlessError(
            `Could not find hosted zone for validation record: ${record.Name}`,
            ServerlessErrorCodes.route53.ROUTE53_HOSTED_ZONE_NOT_FOUND,
          )
        }

        const hostedZoneId = targetHostedZone.Id.replace('/hostedzone/', '')

        Logging.logInfo(`Creating DNS validation record: ${record.Name}`)

        const params = {
          ChangeBatch: {
            Changes: [
              {
                Action: ChangeAction.UPSERT,
                ResourceRecordSet: {
                  Name: record.Name,
                  Type: record.Type,
                  TTL: 300,
                  ResourceRecords: [
                    {
                      Value: record.Value,
                    },
                  ],
                },
              },
            ],
            Comment: `DNS validation record created by "${Globals.pluginName}" for ACM certificate`,
          },
          HostedZoneId: hostedZoneId,
        }

        await this.route53.changeResourceRecordSets(params).promise()
      }
    } catch (err) {
      throw new ServerlessError(
        `Failed to create certificate validation records: ${err.message}`,
        ServerlessErrorCodes.route53.ROUTE53_CERTIFICATE_VALIDATION_RECORDS_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Change A Alias record through Route53 based on given action
   * @param {string} action String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
   * @param {DomainConfig} domain DomainInfo object containing info about custom domain
   * @returns {Promise<void>}
   */
  async changeResourceRecordSet(action, domain) {
    if (domain.createRoute53Record === false) {
      Logging.logInfo(
        `Skipping ${action === ChangeAction.DELETE ? 'removal' : 'creation'} of Route53 record.`,
      )
      return
    }
    Logging.logInfo(
      `Creating/updating route53 record for '${domain.givenDomainName}'.`,
    )
    // Set up parameters
    const route53HostedZoneId = await this.getRoute53HostedZoneId(
      domain,
      domain.hostedZonePrivate,
    )
    const route53Params = domain.route53Params
    const route53healthCheck = route53Params.healthCheckId
      ? { HealthCheckId: route53Params.healthCheckId }
      : {}
    const domainInfo = domain.domainInfo ?? {
      domainName: domain.givenDomainName,
      hostedZoneId: route53HostedZoneId,
    }

    let routingOptions = {}
    if (route53Params.routingPolicy === Globals.routingPolicies.latency) {
      routingOptions = {
        Region: this.region,
        SetIdentifier: route53Params.setIdentifier ?? domainInfo.domainName,
        ...route53healthCheck,
      }
    }

    if (route53Params.routingPolicy === Globals.routingPolicies.weighted) {
      routingOptions = {
        Weight: route53Params.weight,
        SetIdentifier: route53Params.setIdentifier ?? domainInfo.domainName,
        ...route53healthCheck,
      }
    }

    let hostedZoneIds
    if (domain.splitHorizonDns) {
      hostedZoneIds = await Promise.all([
        this.getRoute53HostedZoneId(domain, false),
        this.getRoute53HostedZoneId(domain, true),
      ])
    } else {
      hostedZoneIds = [route53HostedZoneId]
    }

    const recordsToCreate = domain.createRoute53IPv6Record
      ? [RRType.A, RRType.AAAA]
      : [RRType.A]
    for (const hostedZoneId of hostedZoneIds) {
      const changes = recordsToCreate.map((Type) => ({
        Action: action,
        ResourceRecordSet: {
          AliasTarget: {
            DNSName: domainInfo.domainName,
            EvaluateTargetHealth: false,
            HostedZoneId: domainInfo.hostedZoneId,
          },
          Name: domain.givenDomainName,
          Type,
          ...routingOptions,
        },
      }))

      const params = {
        ChangeBatch: {
          Changes: changes,
          Comment: `Record created by "${Globals.pluginName}"`,
        },
        HostedZoneId: hostedZoneId,
      }
      // Make API call
      try {
        await this.route53.changeResourceRecordSets(params).promise()
      } catch (err) {
        throw new ServerlessError(
          `Failed to ${action} ${recordsToCreate.join(',')} Alias for '${domain.givenDomainName}':\n
                    ${err.message}`,
          ServerlessErrorCodes.route53.ROUTE53_RECORD_CHANGE_FAILED,
          { originalMessage: err.message },
        )
      }
    }
  }
}

// Export the constants for use in other files
export { ChangeAction, RRType }
export default Route53Wrapper
