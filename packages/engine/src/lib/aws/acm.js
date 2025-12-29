import {
  ACMClient as AwsSdkACMClient,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand,
  ValidationMethod,
} from '@aws-sdk/client-acm'
import { setTimeout } from 'node:timers/promises'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  addProxyToAwsClient,
} from '@serverless/util'
import { AwsRoute53Client } from './route53.js'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const logger = log.get('aws:acm')

/**
 * Client for managing ACM certificates with automatic DNS validation setup
 * @class
 */
export class AwsAcmClient {
  /**
   * Create ACM client with configured retry strategy
   * @param {string} [region=us-east-1] - AWS region for ACM operations
   * @param {AwsRoute53Client} [route53Client] - Optional pre-configured Route53 client
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkACMClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
    this.route53Client = new AwsRoute53Client(awsConfig)
  }

  /**
   * Find ACM certificate ARN matching a domain or wildcard pattern
   * @param {string} domain - Domain name to search for (matches base domain or SANs)
   * @returns {Promise<string|undefined>} Certificate ARN if found
   * @throws {ServerlessError} If AWS API communication fails
   */
  async findCertificate(domain) {
    const certificates = await this.client.send(new ListCertificatesCommand({}))
    const certificate = certificates.CertificateSummaryList.find((cert) => {
      return (
        cert.DomainName === domain ||
        cert.SubjectAlternativeNames?.includes(domain) ||
        cert.SubjectAlternativeNames?.some(
          (name) => name.startsWith('*.') && domain.endsWith(name.slice(2)),
        )
      )
    })
    return certificate?.CertificateArn
  }

  /**
   * Get full certificate details by ARN
   * @param {string} certificateArn - ACM certificate ARN
   * @returns {Promise<import('@aws-sdk/client-acm').CertificateDetail>}
   * @throws {ServerlessError} For invalid ARNs or API errors
   */
  async getCertificate(certificateArn) {
    const response = await this.client.send(
      new DescribeCertificateCommand({ CertificateArn: certificateArn }),
    )
    return response.Certificate
  }

  /**
   * Provision ACM certificate with DNS validation. Will reuse existing certificate
   * if domain matches, otherwise creates new certificate and sets up DNS records.
   * @param {string} domain - Base domain for certificate (wildcard *.domain included)
   * @returns {Promise<string>} Certificate ARN
   * @throws {ServerlessError} If validation times out (10 minutes) or Route53 setup fails
   */
  async findOrCreateAcmCertificate(domain) {
    // Normalize domain for ACM: strip leading '*.' if present
    let baseDomain = domain
    if (domain.startsWith('*.')) {
      baseDomain = domain.slice(2)
    }

    let certificateArn = await this.findCertificate(baseDomain)

    if (!certificateArn) {
      const requestCertificateResponse = await this.client.send(
        new RequestCertificateCommand({
          DomainName: baseDomain,
          ValidationMethod: ValidationMethod.DNS,
          SubjectAlternativeNames: [`*.${baseDomain}`],
        }),
      )

      logger.debug(
        `Certificate requested for ${baseDomain} ARN: ${requestCertificateResponse.CertificateArn}`,
      )

      certificateArn = requestCertificateResponse.CertificateArn
    } else {
      logger.debug(`Certificate ARN: ${certificateArn} for ${baseDomain}`)
    }

    const hostedZoneId =
      await this.route53Client.findOrCreateHostedZone(baseDomain)
    logger.debug(`Hosted zone ID: ${hostedZoneId}`)

    let statusCheckAttempts = 0
    const maxStatusCheckAttempts = 60

    const alreadyCreatedRecords = new Set()

    while (statusCheckAttempts < maxStatusCheckAttempts) {
      const certificate = await this.getCertificate(certificateArn)
      const validationOptions = certificate?.DomainValidationOptions

      if (validationOptions) {
        for (const option of validationOptions) {
          if (option.ResourceRecord) {
            if (alreadyCreatedRecords.has(option.ResourceRecord.Name)) {
              continue
            }
            alreadyCreatedRecords.add(option.ResourceRecord.Name)
            await this.route53Client.createRecordIfNotExists(
              hostedZoneId,
              option.ResourceRecord,
            )
          }
        }
      }

      if (certificate?.Status !== 'PENDING_VALIDATION') {
        logger.debug(
          `Certificate ${certificateArn} status is ${certificate?.Status} after ${statusCheckAttempts * 10} seconds`,
        )
        break
      }

      logger.debug(
        `Certificate ${certificateArn} status is ${certificate?.Status}, waiting for validation...`,
      )
      await setTimeout(10000)
      statusCheckAttempts++
    }

    if (statusCheckAttempts >= maxStatusCheckAttempts) {
      throw new ServerlessError(
        'Certificate was not validated in time.',
        ServerlessErrorCodes.acm.ACM_CERTIFICATE_VALIDATION_TIMEOUT,
      )
    }

    return certificateArn
  }
}
