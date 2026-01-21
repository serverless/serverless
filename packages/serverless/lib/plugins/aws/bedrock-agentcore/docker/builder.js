'use strict'

import path from 'path'
import { DockerClient } from '@serverless/util'

/**
 * Docker image builder for AgentCore runtimes
 * Uses shared utilities from @serverless/util and @serverless/engine
 */
export class DockerBuilder {
  constructor(serverless, log, progress) {
    this.serverless = serverless
    this.log = log
    this.progress = progress
    this.provider = serverless.getProvider('aws')
    this.dockerClient = new DockerClient()
  }

  /**
   * Check if Docker is available
   */
  async checkDocker() {
    try {
      await this.dockerClient.ensureIsRunning()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get AWS account ID
   */
  async getAccountId() {
    return this.provider.getAccountId()
  }

  /**
   * Get the region
   */
  getRegion() {
    return this.provider.getRegion()
  }

  /**
   * Get ECR authorization token for Docker push
   */
  async getEcrAuthToken() {
    const { ECRClient, GetAuthorizationTokenCommand } =
      await import('@aws-sdk/client-ecr')

    const region = this.getRegion()
    const credentials = await this.provider.getCredentials()

    const ecrClient = new ECRClient({
      region,
      credentials: credentials.credentials,
    })

    const authResponse = await ecrClient.send(
      new GetAuthorizationTokenCommand({}),
    )

    if (
      !authResponse.authorizationData ||
      !authResponse.authorizationData[0].authorizationToken
    ) {
      throw new Error('Failed to get authorization data from ECR')
    }

    const authData = authResponse.authorizationData[0]
    const decodedAuth = Buffer.from(
      authData.authorizationToken,
      'base64',
    ).toString('utf-8')
    const [username, password] = decodedAuth.split(':')

    return {
      username,
      password,
      serveraddress: authData.proxyEndpoint,
    }
  }

  /**
   * Ensure ECR repository exists, create if not
   * Uses direct AWS SDK calls since AwsEcrClient expects a specific naming pattern
   */
  async ensureRepository(repositoryName) {
    this.log.info(`Checking ECR repository: ${repositoryName}`)

    const { ECRClient, CreateRepositoryCommand, DescribeRepositoriesCommand } =
      await import('@aws-sdk/client-ecr')

    const region = this.getRegion()
    const credentials = await this.provider.getCredentials()

    const ecrClient = new ECRClient({
      region,
      credentials: credentials.credentials,
    })

    // Check if repository exists
    try {
      const describeResponse = await ecrClient.send(
        new DescribeRepositoriesCommand({
          repositoryNames: [repositoryName],
        }),
      )

      if (describeResponse.repositories?.length) {
        const repositoryUri = describeResponse.repositories[0].repositoryUri
        this.log.info(`Repository ready: ${repositoryUri}`)
        return repositoryUri
      }
    } catch (error) {
      // Repository not found, continue to create
      if (error.name !== 'RepositoryNotFoundException') {
        throw error
      }
    }

    // Create the repository
    this.log.info(`Creating ECR repository: ${repositoryName}`)
    const createResponse = await ecrClient.send(
      new CreateRepositoryCommand({ repositoryName }),
    )

    if (!createResponse.repository?.repositoryUri) {
      throw new Error(`Failed to create ECR repository: ${repositoryName}`)
    }

    const repositoryUri = createResponse.repository.repositoryUri
    this.log.info(`Repository ready: ${repositoryUri}`)
    return repositoryUri
  }

  /**
   * Build Docker image using DockerClient
   */
  async buildImage(imageUri, dockerConfig, servicePath) {
    const context = dockerConfig.path || '.'
    const platform = dockerConfig.platform || 'linux/arm64'
    const contextPath = path.resolve(servicePath, context)

    this.log.info(`Building Docker image: ${imageUri}`)
    this.log.info(`  Context: ${contextPath}`)
    this.log.info(`  Platform: ${platform}`)

    // Prepare build options
    const buildOptions = dockerConfig.buildOptions || []

    // Add cache-from if specified
    if (dockerConfig.cacheFrom) {
      for (const cache of dockerConfig.cacheFrom) {
        buildOptions.push('--cache-from', cache)
      }
    }

    // Read Dockerfile content if a custom file is specified
    let dockerFileString = null
    if (dockerConfig.file && dockerConfig.file !== 'Dockerfile') {
      const fs = await import('fs/promises')
      const dockerfilePath = path.resolve(
        servicePath,
        context,
        dockerConfig.file,
      )
      dockerFileString = await fs.readFile(dockerfilePath, 'utf-8')
    }

    // Use heroku builder for ARM64 buildpacks support
    // AgentCore requires ARM64, and heroku/builder:24 supports --platform flag
    const builder = platform === 'linux/arm64' ? 'heroku/builder:24' : null

    await this.dockerClient.buildImage({
      containerName: imageUri.split(':')[0].split('/').pop(),
      containerPath: contextPath,
      imageUri,
      dockerFileString,
      buildArgs: dockerConfig.buildArgs || {},
      buildOptions,
      platform,
      builder,
    })

    this.log.info('Docker build complete')
  }

  /**
   * Push image to ECR using DockerClient
   */
  async pushImage(imageUri) {
    this.log.info(`Pushing image to ECR: ${imageUri}`)

    const authConfig = await this.getEcrAuthToken()

    await this.dockerClient.pushImage({
      imageUri,
      authconfig: authConfig,
    })

    this.log.info('Push complete')
    return imageUri
  }

  /**
   * Build and push image for a runtime agent
   */
  async buildAndPushForRuntime(agentName, imageConfig, context) {
    const { serviceName, stage } = context
    const servicePath = this.serverless.serviceDir

    // Repository name
    const repositoryName =
      imageConfig.repository || `${serviceName}-${agentName}`

    // Ensure repository exists and get URI
    const repositoryUri = await this.ensureRepository(repositoryName)

    // Generate unique image URI with timestamp
    const { imageUri } = this.dockerClient.generateImageUris({
      repositoryUri,
      folderHash: stage, // Use stage as part of hash for identification
    })

    this.log.info(`Target image URI: ${imageUri}`)

    // Build the image
    await this.buildImage(imageUri, imageConfig, servicePath)

    // Push to ECR
    await this.pushImage(imageUri)

    return imageUri
  }

  /**
   * Process all images defined in provider.ecr.images
   */
  async processImages(imagesConfig, context) {
    const imageUris = {}

    for (const [imageName, imageConfig] of Object.entries(imagesConfig)) {
      if (imageConfig.uri) {
        imageUris[imageName] = imageConfig.uri
        continue
      }

      if (imageConfig.path) {
        const uri = await this.buildAndPushForRuntime(
          imageName,
          imageConfig,
          context,
        )
        imageUris[imageName] = uri
      }
    }

    return imageUris
  }
}
