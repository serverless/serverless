import {
  SQSClient as AwsSdkSQSClient,
  GetQueueAttributesCommand,
  ListQueuesCommand,
} from '@aws-sdk/client-sqs'
import { log, ServerlessError, addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const logger = log.get('aws:sqs')

/**
 * AWS SQS Client to interact with SQS queues.
 */
export class AwsSqsClient {
  /**
   * Constructor for the AwsSqsClient.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkSQSClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  /**
   * Lists all SQS queues or queues with a specific prefix.
   *
   * @param {Object} [params={}] - Parameters for listing queues.
   * @param {string} [params.queueNamePrefix] - Filter queues by this prefix.
   * @returns {Promise<string[]>} - Array of queue URLs.
   * @throws {ServerlessError} If listing queues fails.
   */
  async listQueues(params = {}) {
    try {
      const { queueNamePrefix } = params
      const command = new ListQueuesCommand({
        QueueNamePrefix: queueNamePrefix,
      })

      const response = await this.client.send(command)
      return response.QueueUrls || []
    } catch (error) {
      logger.error(`Failed to list SQS queues: ${error.message}`)
      throw new ServerlessError(error.message, 'SQS_LIST_QUEUES_FAILED')
    }
  }

  /**
   * Gets detailed attributes of an SQS queue.
   *
   * @param {Object} params - Parameters for getting queue attributes.
   * @param {string} params.queueUrl - The URL of the queue.
   * @param {string[]} [params.attributeNames] - Specific attributes to retrieve. If not provided, all attributes are fetched.
   * @returns {Promise<Object>} - Queue attributes.
   * @throws {ServerlessError} If getting queue attributes fails.
   */
  async getQueueAttributes(params) {
    if (!params.queueUrl) {
      throw new ServerlessError(
        'Queue URL must be provided to get attributes',
        'SQS_QUEUE_URL_MISSING',
      )
    }

    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: params.queueUrl,
        AttributeNames: params.attributeNames || ['All'],
      })

      const response = await this.client.send(command)
      return response.Attributes || {}
    } catch (error) {
      logger.error(`Failed to get SQS queue attributes: ${error.message}`)
      throw new ServerlessError(error.message, 'SQS_GET_ATTRIBUTES_FAILED')
    }
  }

  /**
   * Extracts the queue name from a queue URL.
   *
   * @param {string} queueUrl - The URL of the queue.
   * @returns {string} - The queue name.
   */
  getQueueNameFromUrl(queueUrl) {
    if (!queueUrl) return ''
    return queueUrl.split('/').pop()
  }

  /**
   * Gets detailed information about an SQS queue including all attributes.
   *
   * @param {Object} params - Parameters for getting queue details.
   * @param {string} params.queueUrl - The URL of the queue.
   * @returns {Promise<Object>} - Detailed queue information.
   * @throws {ServerlessError} If getting queue details fails.
   */
  async getQueueDetails(params) {
    if (!params.queueUrl) {
      throw new ServerlessError(
        'Queue URL must be provided to get details',
        'SQS_QUEUE_URL_MISSING',
      )
    }

    try {
      const attributes = await this.getQueueAttributes({
        queueUrl: params.queueUrl,
      })

      return {
        queueUrl: params.queueUrl,
        queueName: this.getQueueNameFromUrl(params.queueUrl),
        attributes,
      }
    } catch (error) {
      logger.error(`Failed to get SQS queue details: ${error.message}`)
      throw new ServerlessError(error.message, 'SQS_GET_DETAILS_FAILED')
    }
  }
}
