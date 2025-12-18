import {
  BucketVersioningStatus,
  CreateBucketCommand,
  GetBucketAclCommand,
  GetBucketEncryptionCommand,
  GetBucketLocationCommand,
  GetBucketPolicyCommand,
  GetBucketVersioningCommand,
  HeadBucketCommand,
  NoSuchBucket,
  NotFound,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { addProxyToAwsClient } from '@serverless/util'

export class AwsS3Client {
  /**
   * Initializes the S3 client.
   *
   * @param {Object} options - The options for initializing the S3 client.
   * @param {string} [options.awsRegion] - The AWS region to use for the S3 client.
   * @param {Object} [options.awsCredentials] - The AWS credentials to use for the S3 client.
   * @returns {AwsS3Client} The initialized S3 service.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new S3Client({
        ...awsConfig,
        followRegionRedirects: true,
      }),
    )
  }

  /**
   * @typedef {Object} BucketParams
   * @property {string} bucketName - The name of the S3 bucket.
   */

  /**
   * Creates an S3 bucket with versioning enabled.
   *
   * @param {BucketParams} params - The parameters for creating the bucket.
   * @returns {Promise<void>}
   */
  async createVersionedBucket({ bucketName }) {
    // Create the S3 bucket
    const createBucketParams = { Bucket: bucketName }
    const createBucketCommand = new CreateBucketCommand(createBucketParams)
    await this.client.send(createBucketCommand)

    // Enable versioning for the S3 bucket
    const versioningParams = {
      Bucket: bucketName,
      VersioningConfiguration: {
        Status: BucketVersioningStatus.Enabled,
      },
    }
    const versioningCommand = new PutBucketVersioningCommand(versioningParams)
    await this.client.send(versioningCommand)
  }

  /**
   * Checks if versioning is enabled for an S3 bucket.
   *
   * @param {Object} params - The parameters for checking versioning.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<boolean>} - Returns true if versioning is enabled, false otherwise.
   */
  async checkBucketVersioning({ bucketName }) {
    try {
      // Get the versioning configuration for the specified bucket
      const versioningParams = { Bucket: bucketName }
      const getVersioningCommand = new GetBucketVersioningCommand(
        versioningParams,
      )
      const versioningResponse = await this.client.send(getVersioningCommand)

      // Check if versioning is enabled
      const versioningStatus = versioningResponse.Status

      if (versioningStatus === BucketVersioningStatus.Enabled) {
        return true
      } else if (versioningStatus === BucketVersioningStatus.Suspended) {
        return false
      } else {
        return false
      }
    } catch (err) {
      const name = err.name
      // Check if the error is due to the bucket not existing
      if (err instanceof NoSuchBucket || name === 'NoSuchBucket') {
        throw new Error(
          `The bucket "${bucketName}" does not exist. Please check the bucket name and try again.`,
        )
      } else {
        // Re-throw any other errors
        throw new Error(
          `An error occurred while checking versioning for bucket "${bucketName}": ${err.message}`,
        )
      }
    }
  }

  /**
   * Checks if an S3 bucket exists.
   *
   * @param {Object} params - The parameters for checking if the bucket exists.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<boolean>} - Returns true if the bucket exists, false otherwise.
   */
  async checkIfBucketExists({ bucketName }) {
    try {
      const headBucketParams = { Bucket: bucketName }
      const headBucketCommand = new HeadBucketCommand(headBucketParams)
      await this.client.send(headBucketCommand)
      return true
    } catch (err) {
      const name = err.name
      if (err instanceof NotFound || name === 'NotFound') {
        return false
      }
      throw new Error(
        `An error occurred while checking if bucket "${bucketName}" exists: ${err.message}`,
      )
    }
  }

  /**
   * Gets the location (region) of an S3 bucket.
   *
   * @param {Object} params - The parameters for getting the bucket location.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<string>} - The bucket location (region).
   */
  async getBucketLocation({ bucketName }) {
    try {
      const params = { Bucket: bucketName }
      const command = new GetBucketLocationCommand(params)
      const response = await this.client.send(command)

      // If LocationConstraint is empty, the bucket is in us-east-1
      return response.LocationConstraint || 'us-east-1'
    } catch (err) {
      const name = err.name
      if (err instanceof NoSuchBucket || name === 'NoSuchBucket') {
        throw new Error(
          `The bucket "${bucketName}" does not exist. Please check the bucket name and try again.`,
        )
      } else {
        throw new Error(
          `An error occurred while getting location for bucket "${bucketName}": ${err.message}`,
        )
      }
    }
  }

  /**
   * Gets the ACL settings of an S3 bucket.
   *
   * @param {Object} params - The parameters for getting the bucket ACL.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<Object>} - The bucket ACL settings.
   */
  async getBucketAcl({ bucketName }) {
    try {
      const params = { Bucket: bucketName }
      const command = new GetBucketAclCommand(params)
      const response = await this.client.send(command)
      return response
    } catch (err) {
      const name = err.name
      if (err instanceof NoSuchBucket || name === 'NoSuchBucket') {
        throw new Error(
          `The bucket "${bucketName}" does not exist. Please check the bucket name and try again.`,
        )
      } else {
        throw new Error(
          `An error occurred while getting ACL for bucket "${bucketName}": ${err.message}`,
        )
      }
    }
  }

  /**
   * Gets the policy attached to an S3 bucket.
   *
   * @param {Object} params - The parameters for getting the bucket policy.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<Object>} - The bucket policy.
   */
  async getBucketPolicy({ bucketName }) {
    try {
      const params = { Bucket: bucketName }
      const command = new GetBucketPolicyCommand(params)
      const response = await this.client.send(command)
      return {
        policy: response.Policy ? JSON.parse(response.Policy) : null,
      }
    } catch (err) {
      const name = err.name
      // If there's no policy, return null instead of throwing an error
      if (name === 'NoSuchBucketPolicy') {
        return { policy: null }
      } else if (err instanceof NoSuchBucket || name === 'NoSuchBucket') {
        throw new Error(
          `The bucket "${bucketName}" does not exist. Please check the bucket name and try again.`,
        )
      } else {
        throw new Error(
          `An error occurred while getting policy for bucket "${bucketName}": ${err.message}`,
        )
      }
    }
  }

  /**
   * Gets the versioning status of an S3 bucket.
   * This is a more detailed version of checkBucketVersioning that returns the full status.
   *
   * @param {Object} params - The parameters for getting the bucket versioning.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<Object>} - The bucket versioning status.
   */
  async getBucketVersioning({ bucketName }) {
    try {
      const params = { Bucket: bucketName }
      const command = new GetBucketVersioningCommand(params)
      const response = await this.client.send(command)
      return {
        status: response.Status || 'Disabled',
        mfaDelete: response.MFADelete || 'Disabled',
      }
    } catch (err) {
      const name = err.name
      if (err instanceof NoSuchBucket || name === 'NoSuchBucket') {
        throw new Error(
          `The bucket "${bucketName}" does not exist. Please check the bucket name and try again.`,
        )
      } else {
        throw new Error(
          `An error occurred while getting versioning for bucket "${bucketName}": ${err.message}`,
        )
      }
    }
  }

  /**
   * Gets the encryption settings of an S3 bucket.
   *
   * @param {Object} params - The parameters for getting the bucket encryption.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<Object>} - The bucket encryption settings.
   */
  async getBucketEncryption({ bucketName }) {
    try {
      const params = { Bucket: bucketName }
      const command = new GetBucketEncryptionCommand(params)
      const response = await this.client.send(command)
      return {
        enabled: true,
        rules: response.ServerSideEncryptionConfiguration?.Rules || [],
      }
    } catch (err) {
      const name = err.name
      // If encryption is not configured, return disabled instead of throwing an error
      if (name === 'ServerSideEncryptionConfigurationNotFoundError') {
        return { enabled: false, rules: [] }
      } else if (err instanceof NoSuchBucket || name === 'NoSuchBucket') {
        throw new Error(
          `The bucket "${bucketName}" does not exist. Please check the bucket name and try again.`,
        )
      } else {
        throw new Error(
          `An error occurred while getting encryption for bucket "${bucketName}": ${err.message}`,
        )
      }
    }
  }

  /**
   * Gets detailed information about an S3 bucket including location, ACL, policy, versioning, and encryption.
   *
   * @param {Object} params - The parameters for getting bucket details.
   * @param {string} params.bucketName - The name of the S3 bucket.
   * @returns {Promise<Object>} - Comprehensive bucket details.
   */
  async getBucketDetails({ bucketName }) {
    try {
      // Check if bucket exists first
      const exists = await this.checkIfBucketExists({ bucketName })
      if (!exists) {
        throw new Error(`The bucket "${bucketName}" does not exist.`)
      }

      // Fetch all bucket details in parallel
      const [location, acl, policy, versioning, encryption] = await Promise.all(
        [
          this.getBucketLocation({ bucketName }).catch((err) => ({
            error: err.message,
          })),
          this.getBucketAcl({ bucketName }).catch((err) => ({
            error: err.message,
          })),
          this.getBucketPolicy({ bucketName }).catch((err) => ({
            error: err.message,
          })),
          this.getBucketVersioning({ bucketName }).catch((err) => ({
            error: err.message,
          })),
          this.getBucketEncryption({ bucketName }).catch((err) => ({
            error: err.message,
          })),
        ],
      )

      return {
        bucketName,
        location,
        acl,
        policy,
        versioning,
        encryption,
      }
    } catch (err) {
      throw new Error(
        `An error occurred while getting details for bucket "${bucketName}": ${err.message}`,
      )
    }
  }
}
