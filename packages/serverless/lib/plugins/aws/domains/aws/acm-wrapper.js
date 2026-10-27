import {
  ACMClient,
  CertificateStatus,
  KeyAlgorithm,
  ListCertificatesCommand,
  RequestCertificateCommand,
  DescribeCertificateCommand,
} from '@aws-sdk/client-acm'
import { addProxyToAwsClient } from '@serverless/util'
import Globals from '../globals.js'
import { getAWSPagedResults, sleep } from '../utils.js'
import Logging from '../logging.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

const certStatuses = [
  CertificateStatus.PENDING_VALIDATION,
  CertificateStatus.ISSUED,
  CertificateStatus.INACTIVE,
]

// ListCertificates returns only RSA certificates unless asked for other key
// types; API Gateway custom domains and CloudFront (web apps) also accept
// ECDSA P-256 and P-384 ones
const keyTypes = [
  KeyAlgorithm.RSA_1024,
  KeyAlgorithm.RSA_2048,
  KeyAlgorithm.EC_prime256v1,
  KeyAlgorithm.EC_secp384r1,
]

class ACMWrapper {
  constructor(credentials, endpointType) {
    const isEdge = endpointType === Globals.endpointTypes.edge
    const config = {
      region: isEdge ? Globals.defaultRegion : Globals.getRegion(),
      endpoint: Globals.getServiceEndpoint('acm'),
      retryStrategy: Globals.getRetryStrategy(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.acm = addProxyToAwsClient(new ACMClient(config))
  }

  async getCertArn(domain) {
    return (await this.getCertificate(domain)).arn
  }

  /**
   * The certificate `getCertArn` selects, with its status.
   * @param {object} domain
   * @returns {Promise<{ arn: string, status: string }>}
   */
  async getCertificate(domain) {
    let certificates
    let certificateArn // The arn of the selected certificate
    let certificateName = domain.certificateName // The certificate name

    try {
      certificates = await getAWSPagedResults(
        this.acm,
        'CertificateSummaryList',
        'NextToken',
        'NextToken',
        new ListCertificatesCommand({
          CertificateStatuses: certStatuses,
          Includes: { keyTypes },
        }),
      )
      if (certificateName) {
        certificateArn = this.getCertArnByCertName(
          certificates,
          certificateName,
        )
      } else {
        certificateName = domain.givenDomainName
        certificateArn = ACMWrapper.getCertArnByDomainName(
          certificates,
          certificateName,
        )
      }
      if (certificateArn) {
        Logging.logInfo(`Found existing certificate ARN: '${certificateArn}'`)
      }
    } catch (err) {
      throw new ServerlessError(
        `Could not search certificates in Certificate Manager.\n${err.message}`,
        ServerlessErrorCodes.domains.ACM_CERTIFICATE_SEARCH_FAILED,
        { originalMessage: err.message },
      )
    }
    if (certificateArn == null) {
      let errorMessage = `Could not find an in-date certificate for '${certificateName}'.`
      if (domain.endpointType === Globals.endpointTypes.edge) {
        errorMessage +=
          ` The endpoint type '${Globals.endpointTypes.edge}' is used. ` +
          `Make sure the needed ACM certificate exists in the '${Globals.defaultRegion}' region.`
      }
      throw new ServerlessError(
        errorMessage,
        ServerlessErrorCodes.domains.ACM_CERTIFICATE_NOT_FOUND,
      )
    }
    const { Status } = certificates.find(
      (c) => c.CertificateArn === certificateArn,
    )
    return { arn: certificateArn, status: Status }
  }

  getCertArnByCertName(certificates, certName) {
    return (
      ACMWrapper.pickCertificate(certificates, (c) =>
        c.DomainName === certName ? 1 : 0,
      )?.CertificateArn ?? null
    )
  }

  static getCertArnByDomainName(certificates, domainName) {
    // A wildcard only covers names one level below it
    const wildcard = `*.${domainName.substring(domainName.indexOf('.') + 1)}`
    return ACMWrapper.pickCertificate(certificates, (c) => {
      const names = [c.DomainName, ...(c.SubjectAlternativeNameSummaries || [])]
      // An exact name is more specific than a wildcard
      if (names.includes(domainName)) return 2
      if (names.includes(wildcard)) return 1
      return 0
    })?.CertificateArn
  }

  /**
   * Picks the certificate with the highest specificity, then an issued one
   * over one pending validation (never an inactive one), then the latest
   * expiry; the listing order breaks remaining ties.
   * @param {Array} certificates ACM certificate summaries
   * @param {(certificate: object) => number} specificityOf How specifically the
   *   certificate covers the name: 0 when it doesn't, higher when more specific
   * @returns {object|undefined} The selected certificate summary
   */
  static pickCertificate(certificates, specificityOf) {
    const statusRank = {
      [CertificateStatus.ISSUED]: 2,
      [CertificateStatus.PENDING_VALIDATION]: 1,
    }
    const rank = (c) => {
      const notAfter = c.NotAfter ? new Date(c.NotAfter).getTime() : 0
      return [
        specificityOf(c),
        statusRank[c.Status] ?? 0,
        Number.isFinite(notAfter) ? notAfter : 0,
      ]
    }
    const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
    let best
    let bestRank
    for (const certificate of certificates) {
      const currentRank = rank(certificate)
      // A certificate that doesn't cover the name or isn't usable never wins
      if (currentRank[0] === 0 || currentRank[1] === 0) continue
      if (!best || compare(currentRank, bestRank) > 0) {
        best = certificate
        bestRank = currentRank
      }
    }
    return best
  }

  /**
   * Creates a new ACM certificate with DNS validation
   * @param {string} domainName The domain name for the certificate
   * @returns {Promise<string>} The ARN of the created certificate
   */
  async createCertificate(domainName) {
    try {
      Logging.logInfo(`Creating ACM certificate for domain '${domainName}'...`)
      const params = {
        DomainName: domainName,
        ValidationMethod: 'DNS',
      }

      const result = await this.acm.send(new RequestCertificateCommand(params))
      Logging.logInfo(
        `Certificate created with ARN: '${result.CertificateArn}'`,
      )
      return result.CertificateArn
    } catch (err) {
      throw new ServerlessError(
        `Failed to create ACM certificate for '${domainName}': ${err.message}`,
        ServerlessErrorCodes.domains.ACM_CERTIFICATE_CREATION_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Gets DNS validation records for a certificate
   * @param {string} certificateArn The ARN of the certificate
   * @param {number} maxWaitTimeSeconds Maximum time to wait for validation records (default: 120)
   * @param {number} pollIntervalSeconds Polling interval in seconds (default: 10)
   * @returns {Promise<Array>} Array of DNS validation records
   */
  async getCertificateValidationRecords(
    certificateArn,
    maxWaitTimeSeconds = 120,
    pollIntervalSeconds = 10,
  ) {
    Logging.logInfo(
      'Waiting for certificate validation records to be available...',
    )

    const startTime = Date.now()
    const maxWaitTimeMs = maxWaitTimeSeconds * 1000

    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        const params = { CertificateArn: certificateArn }
        const result = await this.acm.send(
          new DescribeCertificateCommand(params),
        )

        if (
          result.Certificate.DomainValidationOptions &&
          result.Certificate.DomainValidationOptions.length > 0 &&
          result.Certificate.DomainValidationOptions[0].ResourceRecord
        ) {
          Logging.logInfo('Certificate validation records are now available!')
          return result.Certificate.DomainValidationOptions.map((option) => ({
            Name: option.ResourceRecord.Name,
            Type: option.ResourceRecord.Type,
            Value: option.ResourceRecord.Value,
            Domain: option.DomainName,
          }))
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000)
        Logging.logInfo(
          `Validation records not yet available (${elapsed}s elapsed). Retrying...`,
        )

        await sleep(pollIntervalSeconds)
      } catch (err) {
        throw new ServerlessError(
          `Failed to get validation records for certificate '${certificateArn}': ${err.message}`,
          ServerlessErrorCodes.domains
            .ACM_CERTIFICATE_VALIDATION_RECORDS_FAILED,
          { originalMessage: err.message },
        )
      }
    }

    throw new ServerlessError(
      `Timeout waiting for certificate validation records after ${maxWaitTimeSeconds} seconds`,
      ServerlessErrorCodes.domains.ACM_CERTIFICATE_VALIDATION_RECORDS_TIMEOUT,
    )
  }

  /**
   * Waits for certificate validation to complete
   * @param {string} certificateArn The ARN of the certificate
   * @param {number} maxWaitTimeSeconds Maximum time to wait in seconds (default: 600)
   * @param {number} pollIntervalSeconds Polling interval in seconds (default: 30)
   * @returns {Promise<void>}
   */
  async waitForCertificateValidation(
    certificateArn,
    maxWaitTimeSeconds = 600,
    pollIntervalSeconds = 30,
  ) {
    Logging.logInfo(
      `Waiting for certificate validation to complete (max ${maxWaitTimeSeconds}s)...`,
    )

    const startTime = Date.now()
    const maxWaitTimeMs = maxWaitTimeSeconds * 1000

    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        const params = { CertificateArn: certificateArn }
        const result = await this.acm.send(
          new DescribeCertificateCommand(params),
        )

        if (result.Certificate.Status === 'ISSUED') {
          Logging.logInfo('Certificate validation completed successfully!')
          return
        }

        if (result.Certificate.Status === 'FAILED') {
          throw new ServerlessError(
            'Certificate validation failed',
            ServerlessErrorCodes.domains.ACM_CERTIFICATE_VALIDATION_FAILED,
          )
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000)
        Logging.logInfo(
          `Certificate status: '${result.Certificate.Status}' (${elapsed}s elapsed)`,
        )

        await sleep(pollIntervalSeconds)
      } catch (err) {
        throw new ServerlessError(
          `Error while waiting for certificate validation: ${err.message}`,
          ServerlessErrorCodes.domains.ACM_CERTIFICATE_VALIDATION_FAILED,
          { originalMessage: err.message },
        )
      }
    }

    throw new ServerlessError(
      `Certificate validation timed out after ${maxWaitTimeSeconds} seconds`,
      ServerlessErrorCodes.domains.ACM_CERTIFICATE_VALIDATION_TIMEOUT,
    )
  }
}

export default ACMWrapper
