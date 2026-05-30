import ServerlessError from '../../../../../serverless-error.js'
import {
  DEFAULT_AWS_API_PORT,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
} from '../constants.js'

/**
 * Returns an AWS ARN string for the given service and logical resource ID,
 * using the local-offline fake account and region constants.
 *
 * Supported services: 'sqs', 'sns', 's3', 'events', 'lambda'.
 * Note that S3 ARNs omit region and account per the AWS ARN specification.
 * EventBridge ARNs include the `event-bus/` infix.
 * Lambda ARNs include the `function:` infix.
 *
 * @param {'sqs'|'sns'|'s3'|'events'|'lambda'} service - The AWS service shortname.
 * @param {string} logicalId - The CloudFormation logical resource ID (or resource name).
 * @returns {string} The synthesized ARN.
 * @throws {ServerlessError} With code OFFLINE_UNKNOWN_ARN_SERVICE if the service is not recognised.
 */
export function arnFor(service, logicalId) {
  switch (service) {
    case 'sqs':
      return `arn:aws:sqs:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:${logicalId}`
    case 'sns':
      return `arn:aws:sns:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:${logicalId}`
    case 's3':
      // S3 ARNs have no region or account segment.
      return `arn:aws:s3:::${logicalId}`
    case 'events':
      return `arn:aws:events:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:event-bus/${logicalId}`
    case 'lambda':
      return `arn:aws:lambda:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:function:${logicalId}`
    default:
      throw new ServerlessError(
        `Unknown ARN service "${service}". Supported: sqs, sns, s3, events, lambda.`,
        'OFFLINE_UNKNOWN_ARN_SERVICE',
      )
  }
}

/**
 * Returns the local SQS-style queue URL for the given logical resource ID.
 *
 * The URL follows the format used by LocalStack / ElasticMQ:
 *   http://localhost:<port>/<accountId>/<queueName>
 *
 * @param {string} logicalId - The CloudFormation logical resource ID (queue name).
 * @param {number} [awsApiPort=DEFAULT_AWS_API_PORT] - The port the local AWS API mock is bound to.
 * @returns {string} The synthesized queue URL.
 */
export function queueUrlFor(logicalId, awsApiPort = DEFAULT_AWS_API_PORT) {
  return `http://localhost:${awsApiPort}/${FAKE_ACCOUNT_ID}/${logicalId}`
}

/**
 * Returns the global S3 bucket domain name, matching the `DomainName` return
 * value of `AWS::S3::Bucket`.
 *
 * @param {string} bucketName - The S3 bucket name.
 * @returns {string} e.g. `my-bucket.s3.amazonaws.com`
 */
export function s3DomainName(bucketName) {
  return `${bucketName}.s3.amazonaws.com`
}

/**
 * Returns the regional S3 bucket domain name, matching the
 * `RegionalDomainName` return value of `AWS::S3::Bucket`.
 *
 * @param {string} bucketName - The S3 bucket name.
 * @returns {string} e.g. `my-bucket.s3.us-east-1.amazonaws.com`
 */
export function s3RegionalDomainName(bucketName) {
  return `${bucketName}.s3.${FAKE_REGION}.amazonaws.com`
}

/**
 * Returns the S3 static-website endpoint URL, matching the `WebsiteURL`
 * return value of `AWS::S3::Bucket`.
 *
 * @param {string} bucketName - The S3 bucket name.
 * @returns {string} e.g. `http://my-bucket.s3-website-us-east-1.amazonaws.com`
 */
export function s3WebsiteUrl(bucketName) {
  return `http://${bucketName}.s3-website-${FAKE_REGION}.amazonaws.com`
}
