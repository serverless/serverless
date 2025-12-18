import {
  DynamoDBClient as AwsSdkDynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
  DescribeKinesisStreamingDestinationCommand,
  DescribeTableReplicaAutoScalingCommand,
  DescribeTimeToLiveCommand,
  GetResourcePolicyCommand,
} from '@aws-sdk/client-dynamodb'
import { log, ServerlessError, addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const logger = log.get('aws:dynamodb')

/**
 * AWS DynamoDB Client to interact with DynamoDB tables.
 */
export class AwsDynamoDBClient {
  /**
   * Constructor for the AwsDynamoDBClient.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkDynamoDBClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  /**
   * Lists all DynamoDB tables in the account.
   *
   * @param {Object} [params={}] - Parameters for listing tables.
   * @param {string} [params.exclusiveStartTableName] - The first table name that this operation will evaluate.
   * @param {number} [params.limit] - A maximum number of tables to return.
   * @returns {Promise<string[]>} - Array of table names.
   * @throws {ServerlessError} If listing tables fails.
   */
  async listTables(params = {}) {
    try {
      const { exclusiveStartTableName, limit } = params
      const command = new ListTablesCommand({
        ExclusiveStartTableName: exclusiveStartTableName,
        Limit: limit,
      })

      const response = await this.client.send(command)
      return response.TableNames || []
    } catch (error) {
      logger.error(`Failed to list DynamoDB tables: ${error.message}`)
      throw new ServerlessError(error.message, 'DYNAMODB_LIST_TABLES_FAILED')
    }
  }

  /**
   * Gets detailed information about a DynamoDB table.
   *
   * @param {Object} params - Parameters for describing the table.
   * @param {string} params.tableName - The name of the table to describe.
   * @returns {Promise<Object>} - Table description.
   * @throws {ServerlessError} If describing the table fails.
   */
  async describeTable(params) {
    if (!params.tableName) {
      throw new ServerlessError(
        'Table name must be provided to describe table',
        'DYNAMODB_TABLE_NAME_MISSING',
      )
    }

    try {
      const command = new DescribeTableCommand({
        TableName: params.tableName,
      })

      const response = await this.client.send(command)
      return response.Table || {}
    } catch (error) {
      logger.error(`Failed to describe DynamoDB table: ${error.message}`)
      throw new ServerlessError(error.message, 'DYNAMODB_DESCRIBE_TABLE_FAILED')
    }
  }

  /**
   * Gets detailed information about a DynamoDB table including all attributes.
   *
   * @param {Object} params - Parameters for getting table details.
   * @param {string} params.tableName - The name of the table.
   * @returns {Promise<Object>} - Detailed table information.
   * @throws {ServerlessError} If getting table details fails.
   */
  /**
   * Describes the continuous backups status for a DynamoDB table.
   *
   * @param {Object} params - Parameters for describing continuous backups.
   * @param {string} params.tableName - The name of the table.
   * @returns {Promise<Object>} - Continuous backups description.
   * @throws {ServerlessError} If describing continuous backups fails.
   */
  async describeContinuousBackups(params) {
    if (!params.tableName) {
      throw new ServerlessError(
        'Table name must be provided to describe continuous backups',
        'DYNAMODB_TABLE_NAME_MISSING',
      )
    }

    try {
      const command = new DescribeContinuousBackupsCommand({
        TableName: params.tableName,
      })

      const response = await this.client.send(command)
      return response.ContinuousBackupsDescription || {}
    } catch (error) {
      logger.error(
        `Failed to describe DynamoDB continuous backups: ${error.message}`,
      )
      return { error: error.message }
    }
  }

  /**
   * Describes the Kinesis streaming destination for a DynamoDB table.
   *
   * @param {Object} params - Parameters for describing Kinesis streaming destination.
   * @param {string} params.tableName - The name of the table.
   * @returns {Promise<Object>} - Kinesis streaming destination description.
   * @throws {ServerlessError} If describing Kinesis streaming destination fails.
   */
  async describeKinesisStreamingDestination(params) {
    if (!params.tableName) {
      throw new ServerlessError(
        'Table name must be provided to describe Kinesis streaming destination',
        'DYNAMODB_TABLE_NAME_MISSING',
      )
    }

    try {
      const command = new DescribeKinesisStreamingDestinationCommand({
        TableName: params.tableName,
      })

      const response = await this.client.send(command)
      return response.KinesisDataStreamDestinations || []
    } catch (error) {
      logger.error(
        `Failed to describe DynamoDB Kinesis streaming destination: ${error.message}`,
      )
      return { error: error.message }
    }
  }

  /**
   * Describes the auto scaling settings for a DynamoDB table replica.
   *
   * @param {Object} params - Parameters for describing table replica auto scaling.
   * @param {string} params.tableName - The name of the table.
   * @returns {Promise<Object>} - Table replica auto scaling description.
   * @throws {ServerlessError} If describing table replica auto scaling fails.
   */
  async describeTableReplicaAutoScaling(params) {
    if (!params.tableName) {
      throw new ServerlessError(
        'Table name must be provided to describe table replica auto scaling',
        'DYNAMODB_TABLE_NAME_MISSING',
      )
    }

    try {
      const command = new DescribeTableReplicaAutoScalingCommand({
        TableName: params.tableName,
      })

      const response = await this.client.send(command)
      return response.TableAutoScalingDescription || {}
    } catch (error) {
      logger.debug(
        `Failed to describe DynamoDB table replica auto scaling: ${error.message}`,
      )
      return { error: error.message }
    }
  }

  /**
   * Describes the Time to Live (TTL) settings for a DynamoDB table.
   *
   * @param {Object} params - Parameters for describing Time to Live.
   * @param {string} params.tableName - The name of the table.
   * @returns {Promise<Object>} - Time to Live description.
   * @throws {ServerlessError} If describing Time to Live fails.
   */
  async describeTimeToLive(params) {
    if (!params.tableName) {
      throw new ServerlessError(
        'Table name must be provided to describe Time to Live',
        'DYNAMODB_TABLE_NAME_MISSING',
      )
    }

    try {
      const command = new DescribeTimeToLiveCommand({
        TableName: params.tableName,
      })

      const response = await this.client.send(command)
      return response.TimeToLiveDescription || {}
    } catch (error) {
      logger.error(`Failed to describe DynamoDB Time to Live: ${error.message}`)
      return { error: error.message }
    }
  }

  /**
   * Gets the resource policy for a DynamoDB table.
   *
   * @param {Object} params - Parameters for getting resource policy.
   * @param {string} params.resourceArn - The ARN of the table.
   * @returns {Promise<Object>} - Resource policy.
   * @throws {ServerlessError} If getting resource policy fails.
   */
  async getResourcePolicy(params) {
    if (!params.resourceArn) {
      throw new ServerlessError(
        'Resource ARN must be provided to get resource policy',
        'DYNAMODB_RESOURCE_ARN_MISSING',
      )
    }

    try {
      const command = new GetResourcePolicyCommand({
        ResourceArn: params.resourceArn,
      })

      const response = await this.client.send(command)
      return response.Policy || {}
    } catch (error) {
      logger.error(`Failed to get DynamoDB resource policy: ${error.message}`)
      return { error: error.message }
    }
  }

  async getTableDetails(params) {
    if (!params.tableName) {
      throw new ServerlessError(
        'Table name must be provided to get table details',
        'DYNAMODB_TABLE_NAME_MISSING',
      )
    }

    try {
      const tableDescription = await this.describeTable({
        tableName: params.tableName,
      })

      return {
        tableName: params.tableName,
        tableDetails: tableDescription,
      }
    } catch (error) {
      logger.error(`Failed to get DynamoDB table details: ${error.message}`)
      throw new ServerlessError(error.message, 'DYNAMODB_GET_DETAILS_FAILED')
    }
  }
}
