'use strict'

import path from 'path'
import { ServerlessError } from '@serverless/util'
import { DockerClient } from '@serverless/util/src/docker/index.js'

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
    const buildOptions = dockerConfig.buildOptions || []

    // Use heroku builder for ARM64 buildpacks support
    // AgentCore requires ARM64, and heroku/builder:24 supports --platform flag
    const builder =
      platform === 'linux/arm64'
        ? 'heroku/builder:24@sha256:ad175c86d61399f70bbdab31bbd8b22b34f2d0e2c88e329edb49a8416003b734'
        : null

    this.log.info(`Building Docker image: ${imageUri}`)
    this.log.info(`  Context: ${contextPath}`)
    this.log.info(`  Platform: ${platform}`)

    // Detect build strategy and log it for user visibility
    const dockerfileToCheck = path.resolve(
      contextPath,
      dockerConfig.file || 'Dockerfile',
    )
    try {
      const fs = await import('fs/promises')
      await fs.access(dockerfileToCheck)
      this.log.info(
        `  Build strategy: Dockerfile (${dockerConfig.file || 'Dockerfile'})`,
      )
    } catch {
      this.log.info(
        `  Build strategy: Buildpacks (builder: ${builder || 'default'})`,
      )

      // VALIDATION: Buildpacks for Node.js require a lockfile
      // If package.json exists but no lockfile, dependencies won't be installed
      try {
        const fs = await import('fs/promises')
        const packageJsonPath = path.resolve(contextPath, 'package.json')
        await fs.access(packageJsonPath)

        // package.json exists, check for lockfiles
        const lockfiles = [
          'package-lock.json',
          'npm-shrinkwrap.json',
          'yarn.lock',
          'pnpm-lock.yaml',
        ]
        let lockfileFound = false
        for (const lockfile of lockfiles) {
          try {
            await fs.access(path.resolve(contextPath, lockfile))
            lockfileFound = true
            break
          } catch {
            // Check next lockfile
          }
        }

        if (!lockfileFound) {
          throw new ServerlessError(
            'Missing lockfile for Node.js project. Deployment requires a lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) to ensure consistent dependencies. Please generate a lockfile (e.g., run "npm install") and try again.',
            'MISSING_LOCKFILE',
            { stack: false },
          )
        }
      } catch (error) {
        // Ignore if package.json missing (not a Node.js project)
        // Re-throw if it's our validation error
        if (
          error.code !== 'ENOENT' ||
          error.message.includes('Missing lockfile')
        ) {
          throw error
        }
      }

      return await this.dockerClient.buildImage({
        containerName: imageUri.split(':')[0].split('/').pop(),
        containerPath: contextPath,
        imageUri,
        buildOptions, // These are docker build options, might be ignored by buildpacks path but passed for consistency
        platform,
        builder,
      })
    }

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
   * Build image for a runtime agent (package phase - no AWS operations)
   * @returns {Object} Build metadata including imageUri and repositoryName
   */
  async buildForRuntime(agentName, imageConfig, context) {
    const { serviceName, stage } = context
    const servicePath = this.serverless.serviceDir

    // Repository name (must be lowercase for ECR)
    const repositoryName = (
      imageConfig.repository || `${serviceName}-${agentName}`
    ).toLowerCase()

    // Generate image URI (we'll create ECR repo during push phase)
    const accountId = await this.getAccountId()
    const region = this.getRegion()
    const repositoryUri = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`

    // Generate unique image URI with timestamp
    const { imageUri } = this.dockerClient.generateImageUris({
      repositoryUri,
      folderHash: stage,
    })

    this.log.info(`Target image URI: ${imageUri}`)

    // Build the image locally
    await this.buildImage(imageUri, imageConfig, servicePath)

    // Return metadata for push phase
    return { imageUri, repositoryName, imageConfig }
  }

  /**
   * Push previously built image to ECR (deploy phase)
   */
  async pushForRuntime(buildMetadata) {
    const { imageUri, repositoryName } = buildMetadata

    // Ensure repository exists
    await this.ensureRepository(repositoryName)

    // Push to ECR
    await this.pushImage(imageUri)

    return imageUri
  }

  /**
   * Build and push image for a runtime agent (legacy method for backward compatibility)
   * @deprecated Use buildForRuntime + pushForRuntime instead
   */
  async buildAndPushForRuntime(agentName, imageConfig, context) {
    const buildMetadata = await this.buildForRuntime(
      agentName,
      imageConfig,
      context,
    )
    return await this.pushForRuntime(buildMetadata)
  }

  /**
   * Process all images defined in provider.ecr.images
   * @deprecated This method does build+push. Prefer using buildForRuntime + pushForRuntime separately
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
