import DomainConfig from '../models/domain-config.js'
import Logging from '../logging.js'
import AWS from 'aws-sdk'
import Globals from '../globals.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

class S3Wrapper {
  constructor(credentials) {
    const config = {
      region: Globals.getRegion(),
      endpoint: Globals.getServiceEndpoint('s3'),
      ...Globals.getRetryStrategy(),
      ...Globals.getRequestHandler(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.s3 = new AWS.S3(config)
  }

  /**
   * * Checks whether the Mutual TLS certificate exists in S3 or not
   * @param {DomainConfig} domain
   */
  async assertTlsCertObjectExists(domain) {
    const { Bucket, Key } = S3Wrapper.extractBucketAndKey(
      domain.tlsTruststoreUri,
    )
    const params = { Bucket, Key }

    if (domain.tlsTruststoreVersion) {
      params.VersionId = domain.tlsTruststoreVersion
    }

    try {
      await this.s3.headObject(params).promise()
    } catch (err) {
      if (!err.statusCode || err.statusCode !== 403) {
        throw new ServerlessError(
          `Could not head S3 object at ${domain.tlsTruststoreUri}.\n${err.message}`,
          ServerlessErrorCodes.domains.S3_TLS_CERTIFICATE_OBJECT_NOT_FOUND,
          { originalMessage: err.message },
        )
      }

      Logging.logWarning(
        `Forbidden to check the existence of the S3 object ${domain.tlsTruststoreUri} due to\n${err}`,
      )
    }
  }

  /**
   * * Extracts Bucket and Key from the given s3 uri
   * @param {string} uri
   * @returns {{Bucket: string, Key: string}}
   */
  static extractBucketAndKey(uri) {
    const { hostname, pathname } = new URL(uri)
    return { Bucket: hostname, Key: pathname.substring(1) }
  }
}

export default S3Wrapper
