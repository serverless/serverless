import AWS from 'aws-sdk'
import Globals from '../globals.js'
import { getAWSPagedResults, sleep } from '../utils.js'
import Logging from '../logging.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

const certStatuses = ['PENDING_VALIDATION', 'ISSUED', 'INACTIVE']

class ACMWrapper {
  constructor(credentials, endpointType) {
    const isEdge = endpointType === Globals.endpointTypes.edge
    const config = {
      region: isEdge ? Globals.defaultRegion : Globals.getRegion(),
      endpoint: Globals.getServiceEndpoint('acm'),
      ...Globals.getRetryStrategy(),
      ...Globals.getRequestHandler(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.acm = new AWS.ACM(config)
  }

  async getCertArn(domain) {
    let certificateArn // The arn of the selected certificate
    let certificateName = domain.certificateName // The certificate name

    try {
      const certificates = await getAWSPagedResults(
        this.acm,
        'listCertificates',
        'CertificateSummaryList',
        'NextToken',
        'NextToken',
        { CertificateStatuses: certStatuses },
      )
      // enhancement idea: weight the choice of cert so longer expires
      // and RenewalEligibility = ELIGIBLE is more preferable
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
      Logging.logInfo(`Found a certificate ARN: '${certificateArn}'`)
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
    return certificateArn
  }

  getCertArnByCertName(certificates, certName) {
    const found = certificates.find((c) => c.DomainName === certName)
    if (found) {
      return found.CertificateArn
    }
    return null
  }

  static getCertArnByDomainName(certificates, domainName) {
    // The more specific name will be the longest
    let nameLength = 0
    let certificateArn
    for (const currCert of certificates) {
      const allDomainsForCert = [
        currCert.DomainName,
        ...(currCert.SubjectAlternativeNameSummaries || []),
      ]
      for (const currCertDomain of allDomainsForCert) {
        let certificateListName = currCertDomain
        // Looks for wild card and take it out when checking
        if (certificateListName[0] === '*') {
          certificateListName = certificateListName.substring(1)
        }
        // Looks to see if the domain name matches the certificate domain
        // Also checks if the name is more specific than previous ones
        const isExactMatch = domainName === certificateListName
        const isWildcardMatch =
          certificateListName.startsWith('.') &&
          domainName.endsWith(certificateListName)
        const isSubdomainMatch =
          !certificateListName.startsWith('.') &&
          domainName.endsWith('.' + certificateListName)

        if (
          (isExactMatch || isWildcardMatch || isSubdomainMatch) &&
          certificateListName.length > nameLength
        ) {
          nameLength = certificateListName.length
          certificateArn = currCert.CertificateArn
        }
      }
    }
    return certificateArn
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
        // SubjectAlternativeNames: [],
      }

      const result = await this.acm.requestCertificate(params).promise()
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
        const result = await this.acm.describeCertificate(params).promise()

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
          ServerlessErrorCodes.domains.ACM_CERTIFICATE_VALIDATION_RECORDS_FAILED,
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
        const result = await this.acm.describeCertificate(params).promise()

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
