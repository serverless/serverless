import '@aws-sdk/signature-v4-crt'
import '@aws-sdk/signature-v4a'
import {
  CloudFrontClient,
  CreateKeyValueStoreCommand,
  DescribeKeyValueStoreCommand,
  DeleteKeyValueStoreCommand,
} from '@aws-sdk/client-cloudfront'
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand as KVDescribeCommand,
  PutKeyCommand,
  ListKeysCommand,
  GetKeyCommand,
  DeleteKeyCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore'
import { log, addProxyToAwsClient } from '@serverless/util'

const logger = log.get('aws:cloudfront-kv')

/**
 * CloudFront KeyValueStore Client for managing routing data
 */
export class AwsCloudFrontKVClient {
  constructor(awsConfig = {}) {
    // Default to us-east-1 for CloudFront operations if no region is specified
    // CloudFront is a global service but API calls go through us-east-1
    const region = awsConfig.region || 'us-east-1'

    // We only need CloudFrontClient initially
    // The KeyValueStore client will be created only when we have an ARN
    this.cloudFrontClient = addProxyToAwsClient(
      new CloudFrontClient({
        region: region,
        credentials: awsConfig.credentials,
      }),
    )

    // The KV client must be initialized with a KVS ARN
    // We'll create it later after we have an ARN
    this.kvClient = null
    this.credentials = awsConfig.credentials

    // Store config for logging
    this.region = region
    logger.debug(`Initialized CloudFront KV client with region: ${region}`)
  }

  async getKeyValueStore({ resourceNameBase }) {
    const storeName = `${resourceNameBase}-routing-store`
    const describeCommand = new DescribeKeyValueStoreCommand({
      Name: storeName,
    })

    try {
      const result = await this.cloudFrontClient.send(describeCommand)
      return result.KeyValueStore.ARN
    } catch (error) {
      logger.debug(`Failed to get CloudFront KV store: ${storeName}`, error)
      return undefined
    }
  }

  /**
   * Creates a CloudFront KeyValueStore if it doesn't exist
   * @param {Object} params - The parameters
   * @param {string} params.resourceNameBase - Base name for resources
   * @returns {Promise<Object>} - Information about the created store
   */
  async getOrCreateKeyValueStore({ resourceNameBase }) {
    const storeName = `${resourceNameBase}-routing-store`

    try {
      logger.debug(
        `Creating or getting CloudFront KV store: ${storeName} in region ${this.region}`,
      )
      const existingStore = await this.getKeyValueStore({ resourceNameBase })
      if (existingStore) {
        return {
          arn: existingStore,
          name: storeName,
          status: 'Deployed',
        }
      }
      const createCommand = new CreateKeyValueStoreCommand({
        Name: storeName,
      })

      try {
        // Try to create the KV Store
        const result = await this.cloudFrontClient.send(createCommand)
        logger.debug(`CreateKeyValueStore response:`, JSON.stringify(result))

        // Verify we got a valid response with KVS property
        if (!result || !result.KeyValueStore || !result.KeyValueStore.ARN) {
          logger.error(
            `Unexpected response from CreateKeyValueStore: ${JSON.stringify(result)}`,
          )
          throw new Error('Invalid response from CloudFront KV Store creation')
        }

        const kvsArn = result.KeyValueStore.ARN

        // Now initialize the KV client with the ARN we got
        this._initKVClient(kvsArn)

        logger.debug(
          `Created new CloudFront KV store: ${storeName} with ARN: ${kvsArn}`,
        )

        // Wait for the KeyValue Store to be fully provisioned
        // It starts in PROVISIONING state and should transition to DEPLOYED
        const maxRetries = 30 // Maximum number of retries
        const retryDelay = 2000 // 2 seconds between retries
        let currentStatus = result.KeyValueStore?.Status
        let retries = 0

        while (currentStatus === 'PROVISIONING' && retries < maxRetries) {
          logger.debug(
            `KeyValue Store is in PROVISIONING state, waiting (attempt ${retries + 1}/${maxRetries})...`,
          )
          await new Promise((resolve) => setTimeout(resolve, retryDelay))

          // Check the current status
          const describeCommand = new DescribeKeyValueStoreCommand({
            Name: storeName,
          })
          const describeResult =
            await this.cloudFrontClient.send(describeCommand)
          currentStatus = describeResult.KeyValueStore?.Status
          retries++
        }

        if (currentStatus === 'PROVISIONING') {
          logger.debug(
            `KeyValue Store is still in PROVISIONING state after ${maxRetries} retries`,
          )
        } else {
          logger.debug(`KeyValue Store is now in ${currentStatus} state`)
        }

        return {
          arn: kvsArn,
          name: result.KeyValueStore?.Name,
          status: currentStatus || result.KeyValueStore?.Status,
        }
      } catch (createError) {
        // If it already exists, we'll get an AlreadyExists error
      }
    } catch (error) {
      logger.debug('Failed to create/get CloudFront KV store', error)
      throw error
    }
  }

  /**
   * Creates the KeyValueStore client with the given ARN
   * This is required before any KV operations
   *
   * @param {string} kvsArn - The ARN of the KeyValueStore
   * @private
   */
  _initKVClient(kvsArn) {
    if (!this.kvClient) {
      this.kvClient = addProxyToAwsClient(
        new CloudFrontKeyValueStoreClient({
          region: this.region,
          credentials: this.credentials,
          endpointParams: { KvsARN: kvsArn },
        }),
      )
      logger.debug(`Initialized CloudFront KV client with ARN: ${kvsArn}`)
    }
  }

  /**
   * Updates or adds a route mapping in the KeyValueStore
   * @param {Object} params - The parameters
   * @param {string} params.kvStoreName - Name of the KV store
   * @param {string} params.path - The route path pattern
   * @param {string} params.originId - The origin ID this path routes to
   * @param {string} params.originType - Type of the origin ('lambda' or 'alb')
   * @param {string} params.resourceNameBase - Base name for AWS resources
   * @param {string} [params.previousPath] - Previous path pattern (if path has changed)
   * @returns {Promise<void>}
   */
  async updateRouteMapping({
    kvStoreName,
    path,
    originId,
    originType,
    resourceNameBase,
    previousPath,
  }) {
    try {
      // Initialize KV client with ARN
      this._initKVClient(kvStoreName)

      // {"paths": {"/*": {"originId":"marzgentc-dev-alb-origin","originType":"alb" } } }

      // Using a recursive approach with retries to handle potential ETag conflicts
      const maxRetries = 3
      let retryCount = 0

      const attemptUpdate = async () => {
        try {
          const key = `${resourceNameBase}:routing`
          const currentValue = await this.getRouteMapping({
            kvStoreName,
            path: key,
          })
          let value = undefined

          if (!currentValue) {
            // No existing routing data, create new
            value = {
              paths: {
                [path]: {
                  originId: originId,
                  originType: originType,
                },
              },
            }
          } else {
            value = currentValue

            // If we have a previous path and it's different from the current path,
            // remove the old path entry
            if (
              previousPath &&
              previousPath !== path &&
              value.paths[previousPath]
            ) {
              logger.debug(
                `Removing old path pattern ${previousPath} from KV store`,
              )
              delete value.paths[previousPath]
            }

            // Add or update the current path
            value.paths[path] = {
              originId,
              originType,
            }
          }

          const etag = await this.#getEtag(kvStoreName)
          let ifMatch = etag

          const command = new PutKeyCommand({
            KvsARN: kvStoreName,
            Key: key,
            Value: JSON.stringify(value),
            IfMatch: ifMatch,
          })

          await this.kvClient.send(command)
          logger.debug(`Updated route mapping for path ${path} in KV store`)
          return true // Success
        } catch (error) {
          if (
            error.name === 'ValidationException' &&
            error.message.includes('Pre-Condition failed') &&
            retryCount < maxRetries
          ) {
            retryCount++
            logger.debug(
              `ETag mismatch, retrying (attempt ${retryCount}/${maxRetries})...`,
            )
            // Small delay before retry to reduce race conditions
            await new Promise((resolve) => setTimeout(resolve, 500))
            return attemptUpdate() // Recursive retry
          }
          throw error
        }
      }

      await attemptUpdate()
    } catch (error) {
      logger.debug(`Failed to update route mapping for path ${path}`, error)
      throw error
    }
  }

  async #getEtag(kvStoreArn) {
    const command = new KVDescribeCommand({
      KvsARN: kvStoreArn,
    })

    const result = await this.kvClient.send(command)
    return result.ETag
  }

  /**
   * Deletes a route mapping from the KeyValueStore
   *
   * @param {Object} params - The parameters
   * @param {string} params.kvStoreName - Name of the KV store
   * @param {string} params.path - The route path pattern to delete
   * @returns {Promise<void>}
   */
  async deleteRouteMapping({ kvStoreName, path }) {
    try {
      // Initialize KV client with ARN
      this._initKVClient(kvStoreName)

      // Using a recursive approach with retries to handle potential ETag conflicts
      const maxRetries = 3
      let retryCount = 0

      const attemptDelete = async () => {
        try {
          let ifMatch = null

          try {
            const etag = await this.#getEtag(kvStoreName)
            // Try to get current key to get its ETag
            const getCommand = new GetKeyCommand({
              KvsARN: kvStoreName,
              Key: path,
            })

            const currentKey = await this.kvClient.send(getCommand)
            ifMatch = etag
            logger.debug(`Found existing key with ETag: ${ifMatch}`)
          } catch (keyError) {
            // Key doesn't exist, nothing to delete
            logger.debug(`Key ${path} doesn't exist, nothing to delete`)
            return true
          }

          const command = new DeleteKeyCommand({
            KvsARN: kvStoreName,
            Key: path,
            IfMatch: ifMatch,
          })

          await this.kvClient.send(command)
          logger.debug(`Deleted route mapping for path ${path} from KV store`)
          return true
        } catch (error) {
          if (
            error.name === 'ValidationException' &&
            error.message.includes('Pre-Condition failed') &&
            retryCount < maxRetries
          ) {
            retryCount++
            logger.debug(
              `ETag mismatch during delete, retrying (attempt ${retryCount}/${maxRetries})...`,
            )
            // Small delay before retry to reduce race conditions
            await new Promise((resolve) => setTimeout(resolve, 500))
            return attemptDelete() // Recursive retry
          }
          throw error
        }
      }

      await attemptDelete()
    } catch (error) {
      logger.debug(`Failed to delete route mapping for path ${path}`, error)
      throw error
    }
  }

  /**
   * Lists all route mappings in the KeyValueStore
   * @param {Object} params - The parameters
   * @param {string} params.kvStoreName - Name of the KV store
   * @returns {Promise<Array>} - Array of path keys
   */
  async listRouteMappings({ kvStoreName }) {
    try {
      // Initialize KV client with ARN
      this._initKVClient(kvStoreName)

      const command = new ListKeysCommand({
        KvsARN: kvStoreName,
      })

      const result = await this.kvClient.send(command)
      return result.Keys || []
    } catch (error) {
      logger.debug('Failed to list route mappings', error)
      throw error
    }
  }

  /**
   * Gets a specific route mapping from the KeyValueStore
   * @param {Object} params - The parameters
   * @param {string} params.kvStoreName - Name of the KV store
   * @param {string} params.path - The path key to get
   * @returns {Promise<Object>} - The route mapping data
   */
  async getRouteMapping({ kvStoreName, path }) {
    try {
      // Initialize KV client with ARN
      this._initKVClient(kvStoreName)

      const command = new GetKeyCommand({
        KvsARN: kvStoreName,
        Key: path,
      })

      const result = await this.kvClient.send(command)
      if (!result.Value) {
        return null
      }
      return JSON.parse(result.Value)
    } catch (error) {
      logger.debug(`Failed to get route mapping for path ${path}`, error)
      return null
    }
  }

  /**
   * Deletes a CloudFront KeyValueStore
   * @param {Object} params - The parameters
   * @param {string} params.resourceNameBase - Base name for resources
   * @returns {Promise<void>}
   */
  async deleteKeyValueStore({ resourceNameBase }) {
    const storeName = `${resourceNameBase}-routing-store`

    try {
      // First check if the KV store exists
      const existingStore = await this.getKeyValueStore({ resourceNameBase })
      if (!existingStore) {
        logger.debug(
          `CloudFront KV store ${storeName} does not exist, nothing to delete`,
        )
        return
      }

      // Get the ETag for the KV store
      try {
        // First we need to get the ETag for the KV store
        const describeCommand = new DescribeKeyValueStoreCommand({
          Name: storeName,
        })

        const describeResult = await this.cloudFrontClient.send(describeCommand)
        const etag = describeResult.ETag

        if (!etag) {
          logger.debug(
            `Failed to get ETag for CloudFront KV store ${storeName}`,
          )
          throw new Error('Missing ETag for CloudFront KV store')
        }

        // Delete the KV store with the ETag
        const deleteCommand = new DeleteKeyValueStoreCommand({
          Name: storeName,
          IfMatch: etag,
        })

        await this.cloudFrontClient.send(deleteCommand)
        logger.debug(`CloudFront KV store ${storeName} deleted successfully`)
      } catch (error) {
        logger.debug(`Failed to delete CloudFront KV store ${storeName}`, error)
        throw error
      }
    } catch (error) {
      logger.debug(`Failed to delete CloudFront KV store ${storeName}`, error)
      throw error
    }
  }
}
