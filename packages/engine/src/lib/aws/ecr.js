import { promisify } from 'util'
import { exec } from 'child_process'
import {
  ECRClient as AwsSdkECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  GetAuthorizationTokenCommand,
  RepositoryNotFoundException,
} from '@aws-sdk/client-ecr'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'

const logger = log.get('aws:ecr')
const execAsync = promisify(exec)

export class AwsEcrClient {
  /**
   * Constructor for the AwsEcrClient
   * @param {Object} params - Constructor parameters
   * @param {string} params.region - The AWS region
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkECRClient({
        ...awsConfig,
      }),
    )
  }

  /**
   * Get or create an AWS ECR repository
   * @param {string} containerName
   * @param {string} resourceNameBase
   * @returns {Promise<string>}
   */
  async getOrCreateEcrRepository({ containerName, resourceNameBase }) {
    const repositoryName = `${resourceNameBase}-${containerName}`
    try {
      const describeResponse = await this.client.send(
        new DescribeRepositoriesCommand({
          repositoryNames: [repositoryName],
        }),
      )

      // If the repository exists, return the URI
      if (describeResponse.repositories?.length) {
        logger.debug(
          `AWS ECR repository already exists: ${describeResponse.repositories[0].repositoryUri}`,
        )
        return describeResponse.repositories[0].repositoryUri
      }
    } catch (error) {
      const name = error.name
      if (
        !(
          error instanceof RepositoryNotFoundException ||
          name === 'RepositoryNotFoundException'
        )
      ) {
        throw new ServerlessError(error.message, 'AWS_ECR_REPOSITORY_NOT_FOUND')
      }
    }

    // If the repository does not exist, create it
    try {
      logger.debug(
        `AWS ECR repository not found, creating AWS ECR repository: ${repositoryName}`,
      )
      const createResponse = await this.client.send(
        new CreateRepositoryCommand({ repositoryName }),
      )
      if (!createResponse.repository?.repositoryUri) {
        throw new ServerlessError(
          `Failed to create ECR repository: ${repositoryName}`,
          'AWS_ECR_REPOSITORY_NOT_FOUND',
        )
      }
      return createResponse.repository.repositoryUri
    } catch (error) {
      throw new ServerlessError(error.message, 'AWS_ECR_REPOSITORY_NOT_FOUND')
    }
  }

  /**
   * Login to AWS ECR repository using Docker
   * @param {Object} params - Login parameters
   * @param {string} params.ecrRepository - The ECR repository URI to login to
   * @returns {Promise<void>}
   */
  async loginToEcrRepository({ ecrRepository }) {
    const authResponse = await this.client.send(
      new GetAuthorizationTokenCommand({}),
    )
    if (
      !authResponse.authorizationData ||
      !authResponse.authorizationData[0].authorizationToken
    ) {
      throw new ServerlessError(
        'Failed to get authorization data from ECR',
        'AWS_ECR_LOGIN_FAILED',
      )
    }

    const authToken = authResponse.authorizationData[0].authorizationToken
    const [username, password] = Buffer.from(authToken, 'base64')
      .toString()
      .split(':')

    // Docker login to ECR
    const loginCommand = `echo ${password} | docker login --username ${username} --password-stdin ${ecrRepository}`
    await execAsync(loginCommand)

    logger.debug('Successfully logged into AWS ECR repository')
  }

  /**
   * Gets ECR authorization token and decodes it
   * @returns {Promise<{username: string, password: string, serveraddress: string}>} ECR auth credentials
   */
  async getEcrAuthorizationToken() {
    const data = await this.client.send(new GetAuthorizationTokenCommand({}))
    const { authorizationToken, proxyEndpoint } = data.authorizationData[0]
    const decodedToken = Buffer.from(authorizationToken, 'base64').toString(
      'utf-8',
    )
    const [username, password] = decodedToken.split(':')

    return {
      username, // Will be 'AWS'
      password, // The actual token
      serveraddress: proxyEndpoint,
    }
  }
}
