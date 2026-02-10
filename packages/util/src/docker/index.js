import path from 'node:path'
import fs from 'fs'
import { spawn } from 'node:child_process'
import Dockerode from 'dockerode'
import { ServerlessError } from '../errors/index.js'
import { log } from '../logger/index.js'
import { writeFile } from 'fs/promises'
import { getRcConfig } from '../rc/index.js'

/**
 * Docker client wrapper class providing high-level Docker operations
 */
class DockerClient {
  /**
   * Creates a new DockerClient instance
   * @param {Object} params - Configuration options
   * @param {Object} [params.dockerodeConfig] - Dockerode configuration options
   * @param {Object} [params.logger] - Custom logger instance
   */
  constructor({ dockerodeConfig = {} } = {}) {
    this.client = new Dockerode(dockerodeConfig)
    this.logger = log.get('utils:docker')
  }

  /**
   * Gets the underlying Dockerode client instance
   * @returns {Dockerode}
   */
  getDockerodeClient() {
    return this.client
  }

  /**
   * Gets a container if it exists, returns null if it doesn't
   * @param {Object} params
   * @param {string} params.containerName - Name of container to get
   * @returns {Promise<Container|null>} Container object or null if not found
   */
  async getContainerIfExists({ containerName }) {
    try {
      const container = this.client.getContainer(containerName)
      await container.inspect()
      return container
    } catch (error) {
      if (error.statusCode === 404) {
        return null
      }
      throw error
    }
  }

  /**
   * Gets a Docker container by name
   * @param {Object} params
   * @param {string} params.containerName - Name of the container
   * @returns {Promise<Dockerode.Container|null>}
   */
  async getContainer({ containerName }) {
    const containers = await this.client.listContainers({ all: true })
    const container = containers.find(
      (c) =>
        c.Names.includes(`/${containerName}`) ||
        c.Names.includes(containerName),
    )
    return container ? this.client.getContainer(container.Id) : null
  }

  /**
   * Stops and removes a container if it exists
   * @param {Object} params
   * @param {string} params.containerName - Name of the container to remove
   * @returns {Promise<void>}
   */
  async removeContainer({ containerName }) {
    const container = await this.getContainer({ containerName })
    if (container) {
      this.logger.debug(`Removing container: ${containerName}`)
      try {
        await container.stop()
      } catch (error) {
        // Container might already be stopped
        this.logger.debug(
          'Container already stopped or error stopping:',
          error.message,
        )
      }
      await container.remove()
    }
  }

  /**
   * Gets the size of a Docker image in MB
   * @param {Object} params - Parameters
   * @param {string} params.imageUri - Image URI to check
   * @returns {Promise<number|null>} Image size in MB or null if size cannot be determined
   */
  async getImageSize({ imageUri }) {
    try {
      const image = await this.client.getImage(imageUri)
      const info = await image.inspect()
      const sizeInMB = Number((info.Size / (1024 * 1024)).toFixed(2))
      this.logger.debug(`Docker image size: ${sizeInMB}MB`)
      return sizeInMB
    } catch (error) {
      this.logger.debug(`Could not get image size: ${error.message}`)
      return null
    }
  }

  /**
   * Generates consistent image URIs for container and lambda versions
   * @param {Object} params - Parameters for URI generation
   * @param {string} params.repositoryUri - Base repository URI
   * @param {string} [params.folderHash] - Content hash for tagging
   * @returns {Object} Object containing imageUri and imageAwsLambdaUri
   */
  generateImageUris({ repositoryUri, folderHash }) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace(/[TZ]/g, '-')
    const tag = folderHash
      ? `${timestamp}-${folderHash.substring(0, 8)}`
      : 'latest'

    const imageUri = `${repositoryUri}:${tag}`
    const imageAwsLambdaUri = `${imageUri}-lambda`

    return { imageUri, imageAwsLambdaUri }
  }

  /**
   * Builds a Docker image
   * @param {Object} params - Build parameters
   * @param {string} params.containerName - Name of the container
   * @param {string} params.containerPath - Path to container source
   * @param {string} params.imageUri - Full image URI with tag
   * @param {string} [params.dockerFileString] - Optional Dockerfile content
   * @param {Object} [params.buildArgs={}] - Build arguments to pass to Docker
   * @param {string|Array<string>} [params.buildOptions=[]] - Additional Docker build flags (e.g. '--target production')
   * @param {string|null} [params.aiFramework=null] - AI framework detected in the project
   * @param {string} [params.platform='linux/amd64'] - Target platform for the image (e.g. 'linux/amd64', 'linux/arm64')
   * @param {string} [params.builder] - Buildpacks builder image (default: gcr.io/buildpacks/builder, use 'heroku/builder:24' for ARM64)
   * @throws {ServerlessError} If the build fails
   * @returns {Promise<string>} The URI of the built image
   */
  async buildImage({
    containerName,
    containerPath,
    imageUri,
    dockerFileString = null,
    buildArgs = {},
    buildOptions = [],
    aiFramework = null,
    platform = 'linux/amd64',
    builder = null,
  }) {
    try {
      if (aiFramework === 'mastra') {
        dockerFileString = `
# Builder stage: compile TypeScript and build the application
FROM node:lts-alpine AS builder

# Set working directory
WORKDIR /app

# Copy dependency manifests for layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm i

# Copy configuration files
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build the application using mastra as specified in package.json
RUN npx mastra build

# Production stage: lightweight image with only necessary components
FROM node:lts-alpine AS production

# Set environment variables
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup -S appgroup && \
    adduser -S -G appgroup appuser

# Copy the built application from the builder stage
COPY --from=builder /app/.mastra/output /app

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port if needed (uncomment and set the appropriate port)
# EXPOSE 3000
EXPOSE 8080

# Command to run the application
# The correct entry point based on the Mastra build output
# node --import=./.mastra/output/instrumentation.mjs .mastra/output/index.mjs
CMD ["node", "index.mjs"]
        `
        this.logger.debug('Building image using Mastra Dockerfile')
      }
      // If dockerFileString is provided, use it to build the image
      if (dockerFileString) {
        this.logger.debug('Building image using Dockerfile from config')
        return await this.#buildImageUsingDockerfile({
          containerName,
          containerPath,
          imageUri,
          dockerFileString,
          buildArgs,
          buildOptions,
          platform,
        })
      }

      // If dockerFileString is not provided, check if Dockerfile exists
      this.logger.debug(
        'Checking if Dockerfile exists',
        path.join(containerPath, 'Dockerfile'),
      )
      await fs.promises.access(path.join(containerPath, 'Dockerfile'))
      this.logger.debug('Dockerfile exists. Building image using Dockerfile')
      return await this.#buildImageUsingDockerfile({
        containerName,
        containerPath,
        imageUri,
        buildArgs,
        buildOptions,
        platform,
      })
    } catch (error) {
      if (error instanceof ServerlessError) {
        throw error
      }

      if (error.code === 'ENOENT') {
        this.logger.debug(
          'Dockerfile does not exist. Building image using pack',
        )
        return await this.#buildUsingBuildPack({
          containerName,
          containerPath,
          imageUri,
          platform,
          builder,
        })
      }

      // Wrap other errors in ServerlessError
      throw new ServerlessError(
        `Failed to build Docker image for "${containerName}": ${error.message}`,
        'DOCKER_BUILD_FAILED',
        { stack: error.stack },
      )
    }
  }

  /**
   * Build Docker image using Dockerfile
   * @param {Object} params - Build parameters
   * @param {string} params.containerPath - Path to service directory
   * @param {string} params.containerName - Name of the container
   * @param {string} params.imageUri - Local or repository version tag
   * @param {string} [params.dockerFileString] - Optional Dockerfile contents as string
   * @param {Object} [params.buildArgs={}] - Build arguments to pass as --build-arg flags
   * @param {string|Array<string>} [params.buildOptions=[]] - Additional Docker build flags (e.g. '--target production')
   * @param {string} [params.platform='linux/amd64'] - Target platform for the image
   * @returns {Promise<string>}
   */
  async #buildImageUsingDockerfile({
    containerName,
    containerPath,
    imageUri,
    dockerFileString = null,
    buildArgs = {},
    buildOptions = [],
    platform = 'linux/amd64',
  }) {
    const buildOutput = []
    this.logger.debug(
      `Building Docker image using Dockerfile for platform ${platform}`,
    )

    const dockerfilePath = dockerFileString
      ? path.join(containerPath, 'Dockerfile')
      : null
    try {
      // If dockerFileString is provided, write it to a temporary Dockerfile
      if (dockerFileString) {
        await writeFile(dockerfilePath, dockerFileString)
      }

      return await new Promise((resolve, reject) => {
        // Start constructing the Docker build command with the base flags
        const buildCommand = ['build', '--load', '--platform', platform]

        // Process additional build options if provided.
        if (buildOptions) {
          if (typeof buildOptions === 'string') {
            buildCommand.push(...buildOptions.split(/\s+/))
          } else if (Array.isArray(buildOptions)) {
            buildCommand.push(...buildOptions)
          }
        }

        // Add build arguments using the --build-arg flag
        Object.entries(buildArgs).forEach(([key, value]) => {
          buildCommand.push('--build-arg', `${key}=${value}`)
        })

        // Add image tag and context path
        buildCommand.push('-t', imageUri, containerPath)

        const dockerProcess = spawn('docker', buildCommand)

        dockerProcess.stdout.on('data', (data) =>
          this.#handleBuildOutput({ buildOutput, data }),
        )

        dockerProcess.stderr.on('data', (data) =>
          this.#handleBuildOutput({ buildOutput, data }),
        )

        dockerProcess.on('error', (error) => {
          const buildError = this.#handleBuildFailure({
            containerName,
            buildOutput,
            error,
          })
          reject(buildError)
        })

        dockerProcess.on('close', (code) => {
          if (code === 0) {
            this.logger.debug(`Successfully built image: ${imageUri}`)
            resolve(imageUri)
          } else {
            const buildError = this.#handleBuildFailure({
              containerName,
              buildOutput,
              error: { message: `Exit code: ${code}` },
            })
            reject(buildError)
          }
        })
      })
    } finally {
      // Cleanup temporary Dockerfile if we created one
      if (dockerfilePath) {
        try {
          await fs.promises.unlink(dockerfilePath)
        } catch (error) {
          this.logger.debug(`Error cleaning up Dockerfile: ${error.message}`)
        }
      }
    }
  }

  /**
   * Build Docker image using Buildpacks
   * @param {Object} params - Build parameters
   * @param {string} params.containerName - Name of the container
   * @param {string} params.containerPath - Path to container source
   * @param {string} params.imageUri - Full image URI with tag
   * @param {string} [params.platform='linux/amd64'] - Target platform for the image
   * @param {string} [params.builder] - Buildpacks builder image (default: gcr.io/buildpacks/builder)
   * @returns {Promise<string>}
   */
  async #buildUsingBuildPack({
    containerName,
    containerPath,
    imageUri,
    platform = 'linux/amd64',
    builder = null,
  }) {
    const buildOutput = []

    // Default to Google Cloud buildpacks builder for backward compatibility
    // Use heroku/builder:24 for ARM64 support
    const builderImage =
      builder ||
      'gcr.io/buildpacks/builder@sha256:5977b4bd47d3e9ff729eefe9eb99d321d4bba7aa3b14986323133f40b622aef1'

    this.logger.debug(
      `${containerName}: Building Docker image using Buildpacks for platform ${platform} with builder ${builderImage}. Container path: ${containerPath}, Image URI: ${imageUri}`,
    )

    // Read frameworkId from .serverlessrc for buildpack volume caching
    let volumeKey = null
    try {
      const rcConfig = await getRcConfig('serverless')
      volumeKey = rcConfig?.frameworkId || null
    } catch {
      // .serverlessrc not available, skip
    }

    // Build pack command arguments
    const packArgs = [
      'run',
      '--rm',
      ...(volumeKey ? ['-e', `PACK_VOLUME_KEY=${volumeKey}`] : []),
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
      '-v',
      `${containerPath}:/workspace`,
      '-w',
      '/workspace',
      'buildpacksio/pack',
      'build',
      imageUri,
      '--builder',
      builderImage,
      '--trust-builder',
      '--cache',
      `type=build;format=volume;name=${containerName}-build-cache`,
      '--cache',
      `type=launch;format=volume;name=${containerName}-launch-cache`,
    ]

    // Add platform flag only if using a builder that supports it (like heroku/builder:24)
    if (builder && platform) {
      packArgs.push('--platform', platform)
    }

    return await new Promise((resolve, reject) => {
      const packProcess = spawn('docker', packArgs)

      packProcess.stdout.on('data', (data) =>
        this.#handleBuildOutput({ buildOutput, data }),
      )

      packProcess.stderr.on('data', (data) =>
        this.#handleBuildOutput({ buildOutput, data }),
      )

      packProcess.on('error', (error) => {
        const buildError = this.#handleBuildFailure({
          containerName,
          buildOutput,
          error,
        })
        reject(buildError)
      })

      packProcess.on('close', (code) => {
        if (code === 0) {
          this.logger.debug(`Successfully built image: ${imageUri}`)
          this.logger.debug('Built Docker image using Buildpacks')
          resolve(imageUri)
        } else {
          const buildError = this.#handleBuildFailure({
            containerName,
            buildOutput,
            error: { message: `Exit code: ${code}` },
          })
          reject(buildError)
        }
      })
    })
  }

  /**
   * Build a Lambda-compatible Docker image from an existing image
   * @param {Object} params - Build parameters
   * @param {string} params.imageUri - The name of the existing Docker image
   * @param {number} [params.port=8080] - The port to expose in the Lambda image
   * @param {boolean} [params.local=false] - Whether to build for local testing
   * @returns {Promise<string>} The URI of the built Lambda Docker image
   */
  async buildImageAwsLambda({ imageUri, port = 8080, local = false }) {
    const buildOutput = []

    // Remove -lambda suffix for base image if present
    const baseImageUri = imageUri.replace('-lambda', '')
    this.logger.debug(`Building AWS Lambda Docker image: ${imageUri}`)

    let dockerfileContent = `FROM ${baseImageUri}
    COPY --from=public.ecr.aws/lambda/nodejs:20 /usr/local/bin/aws-lambda-rie /aws-lambda-rie
    COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter
    ENV AWS_LWA_PORT=${port}`

    if (local) {
      dockerfileContent = `${dockerfileContent}
    ENTRYPOINT ["/aws-lambda-rie", "--runtime-interface-emulator-address", "0.0.0.0:9000", "/cnb/process/web"]`
    }

    // Only append -lambda if it's not already present
    const lambdaImageUri = imageUri.endsWith('-lambda')
      ? imageUri
      : imageUri.includes(':')
        ? `${imageUri}-lambda`
        : `${imageUri}:lambda`

    return await new Promise((resolve, reject) => {
      const dockerProcess = spawn('docker', [
        'build',
        '--provenance=false',
        '--platform=linux/amd64',
        '--load',
        '-t',
        lambdaImageUri,
        '-f-',
        '.',
      ])

      dockerProcess.stdin.write(dockerfileContent)
      dockerProcess.stdin.end()

      dockerProcess.stdout.on('data', (data) =>
        this.#handleBuildOutput({ buildOutput, data }),
      )

      dockerProcess.stderr.on('data', (data) =>
        this.#handleBuildOutput({ buildOutput, data }),
      )

      dockerProcess.on('error', (error) => {
        const buildError = this.#handleBuildFailure({
          containerName: lambdaImageUri,
          buildOutput,
          error,
        })
        reject(buildError)
      })

      dockerProcess.on('close', (code) => {
        if (code === 0) {
          this.logger.debug(
            `Successfully built Docker image for AWS Lambda: ${lambdaImageUri}`,
          )
          resolve(lambdaImageUri)
        } else {
          const buildError = this.#handleBuildFailure({
            containerName: lambdaImageUri,
            buildOutput,
            error: { message: `Exit code: ${code}` },
          })
          reject(buildError)
        }
      })
    })
  }

  /**
   * Handles Docker build output and error logging
   * @param {Object} params - Parameters for build output handling
   * @param {Array<string>} params.buildOutput - Array to store build output lines
   * @param {string} params.data - The data/log line to process
   * @param {Function} params.logger - Logger instance to use
   */
  #handleBuildOutput({ buildOutput, data }) {
    const logLine = data.toString()
    buildOutput.push(logLine)
    this.logger.debug(logLine)
  }

  /**
   * Creates appropriate error based on build output
   * @param {Object} params - Parameters for error handling
   * @param {Array<string>} params.buildOutput - Complete build output lines
   * @param {Error|Object} [params.error] - Original error if available
   * @returns {ServerlessError} Formatted error with appropriate message
   */
  #handleBuildFailure({ containerName, buildOutput }) {
    const fullBuildLog = buildOutput.join('\n')

    // Remove last linebreak if it exists
    const lastLinebreakIndex = fullBuildLog.lastIndexOf('\n')
    const truncatedBuildLog =
      lastLinebreakIndex !== -1
        ? fullBuildLog.slice(0, lastLinebreakIndex)
        : fullBuildLog

    this.logger.error(
      `Docker build failed for "${containerName}". Here's Docker's full build output:\n\n${truncatedBuildLog}`,
    )

    // Check for common Docker failure patterns
    if (fullBuildLog.includes('no space left on device')) {
      return new ServerlessError(
        `Docker build failed for "${containerName}": No disk space available`,
        'KONTINUUM_ECR_CREATE_REPOOSITORY_FAILED',
        { stack: false },
      )
    }
    if (fullBuildLog.includes('network timeout')) {
      return new ServerlessError(
        `Docker build failed for "${containerName}": Network timeout`,
        'KONTINUUM_ECR_CREATE_REPOOSITORY_FAILED',
        { stack: false },
      )
    }
    if (fullBuildLog.includes('permission denied')) {
      return new ServerlessError(
        `Docker build failed for "${containerName}": Permission denied`,
        'KONTINUUM_ECR_CREATE_REPOOSITORY_FAILED',
        { stack: false },
      )
    }
    // Default error
    return new ServerlessError(
      `Docker build failed for "${containerName}". Review Docker's build output above for details.`,
      'KONTINUUM_ECR_CREATE_REPOOSITORY_FAILED',
      { stack: false },
    )
  }

  /**
   * Tails logs for a container
   * @param {Object} params
   * @param {string} params.containerName - Name of the container to tail logs for
   * @param {Function} [params.onData] - Callback function to handle log data
   * @returns {Promise<void>}
   */
  async tailLogs({
    containerName,
    onData = () => {},
    onError = () => {},
    onEnd = () => {},
  }) {
    const serviceContainer = await this.getContainerIfExists({ containerName })

    if (!serviceContainer) {
      throw new ServerlessError(
        `Unable to tail logs due to container "${containerName}" not found`,
        'CONTAINER_NOT_FOUND',
      )
    }
    const stream = await serviceContainer.logs({
      follow: true,
      stdout: true,
      stderr: true,
    })

    stream.on('data', onData)
    stream.on('error', onError)
    stream.on('end', onEnd)

    return stream
  }

  /**
   * Pushes a Docker image
   * @param {Object} params
   * @param {string} params.imageUri - Full image URI with tag
   * @param {Object} [params.authconfig] - Registry auth config
   */
  async pushImage({ imageUri, authconfig }) {
    // Log image size if available
    await this.getImageSize({ imageUri })

    return await new Promise((resolve, reject) => {
      // Add timeout to prevent infinite hanging
      const timeout = setTimeout(
        () => {
          reject(
            new ServerlessError(
              'Docker push timed out after 10 minutes',
              'DOCKER_PUSH_TIMEOUT',
            ),
          )
        },
        10 * 60 * 1000,
      ) // 10 minute timeout

      const pushOptions = {
        tag: imageUri.split(':')[1] || 'latest',
      }

      if (authconfig?.username && authconfig?.password) {
        pushOptions.authconfig = authconfig
      }

      this.client.getImage(imageUri).push(pushOptions, (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          return reject(
            new ServerlessError(
              `Failed to initiate Docker push: ${err.message}`,
              'DOCKER_PUSH_FAILED',
            ),
          )
        }

        let digestFound = false
        let lastStatus = ''
        let lastProgressTime = Date.now()

        this.client.modem.followProgress(
          stream,
          (err, output) => {
            clearTimeout(timeout)
            if (err) {
              reject(
                new ServerlessError(
                  `Docker push failed: ${err.message}`,
                  'DOCKER_PUSH_FAILED',
                ),
              )
              return
            }

            if (digestFound) {
              resolve(output)
              return
            }

            reject(
              new ServerlessError(
                'Docker push completed without digest confirmation',
                'DOCKER_PUSH_INCOMPLETE',
              ),
            )
          },
          (event) => {
            // Update progress timestamp
            lastProgressTime = Date.now()

            if (event.aux?.Digest || event.status?.includes('digest:')) {
              digestFound = true
            }

            if (event.error) {
              this.logger.error(`Push error: ${event.error}`)
            } else if (
              event.status &&
              !event.status.includes('Pushing') &&
              event.status !== lastStatus
            ) {
              this.logger.debug(`Push status: ${event.status}`)
              lastStatus = event.status
            }
          },
        )

        // Add progress check interval
        const progressCheck = setInterval(() => {
          const timeSinceLastProgress = Date.now() - lastProgressTime
          if (timeSinceLastProgress > 5 * 60 * 1000) {
            // 5 minutes
            clearInterval(progressCheck)
            clearTimeout(timeout)
            reject(
              new ServerlessError(
                'Docker push stalled - no progress for 5 minutes',
                'DOCKER_PUSH_STALLED',
              ),
            )
          }
        }, 30 * 1000) // Check every 30 seconds

        // Clean up interval on completion
        stream.on('end', () => clearInterval(progressCheck))
      })
    })
  }

  /**
   * Creates a Docker network
   * @param {Object} params
   * @param {string} params.name - Network name
   * @param {string} [params.driver='bridge'] - Network driver
   * @param {Object} [params.options={}] - Additional network options
   * @returns {Promise<Object>} Created network
   */
  async createNetwork({ name, driver = 'bridge', options = {} }) {
    this.logger.debug(`Creating Docker network: ${name}`)
    return await this.client.createNetwork({
      Name: name,
      Driver: driver,
      ...options,
    })
  }

  /**
   * Creates a container
   * @param {Object} params
   * @param {string} params.image - Container image
   * @param {string} params.name - Container name
   * @param {Object} [params.exposedPorts={}] - Ports to expose
   * @param {Object} [params.env={}] - Environment variables
   * @param {Object} [params.labels={}] - Container labels
   * @param {Object} [params.hostConfig={}] - Host configuration
   * @param {Array<string>} [params.cmd=[]] - Command to run
   * @returns {Promise<Dockerode.Container>}
   */
  async createContainer({
    imageUri,
    name,
    exposedPorts = {},
    env = {},
    labels = {},
    hostConfig = {},
    cmd = [],
  }) {
    this.logger.debug(
      `Creating container: ${name}, image: ${imageUri}, cmd: ${cmd}, labels: ${JSON.stringify(labels)}, hostConfig: ${JSON.stringify(hostConfig)}`,
    )

    const envArray = Object.entries(env).map(
      ([key, value]) => `${key}=${value}`,
    )

    try {
      const container = await this.client.createContainer({
        Image: imageUri,
        name,
        ExposedPorts: exposedPorts,
        Env: envArray,
        Labels: labels,
        HostConfig: hostConfig,
        Cmd: cmd,
      })

      return container
    } catch (error) {
      throw new ServerlessError(
        `${name}: Failed to create container: ${error.message}`,
        'CONTAINER_CREATION_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * Ensures Docker daemon is running and accessible
   * @throws {ServerlessError} If Docker is not running
   */
  async ensureIsRunning() {
    try {
      await this.client.ping()
    } catch (error) {
      throw new ServerlessError(
        'Docker is not running. Docker is a requirement. Please ensure it is installed and running - https://www.docker.com/',
        'DOCKER_NOT_RUNNING',
        { stack: false },
      )
    }
  }

  /**
   * Creates a Docker network if it doesn't exist
   * @param {Object} params
   * @param {string} params.networkName - Name of the network to create
   * @returns {Promise<void>}
   */
  async getOrCreateNetwork({ networkName }) {
    const networks = await this.client.listNetworks()
    const networkExists = networks.some(
      (network) => network.Name === networkName,
    )

    if (!networkExists) {
      this.logger.debug(`Creating Docker network: ${networkName}`)
      await this.client.createNetwork({
        Name: networkName,
        Driver: 'bridge',
      })
    }

    return networkExists
  }

  /**
   * Removes a Docker network if it exists
   * @param {Object} params
   * @param {string} params.networkName - Name of the network to remove
   * @returns {Promise<void>}
   */
  async removeNetworkIfExists({ networkName }) {
    const networks = await this.client.listNetworks()
    const network = networks.find((n) => n.Name === networkName)

    if (network) {
      this.logger.debug(`Removing Docker network: ${networkName}`)
      const networkInstance = this.client.getNetwork(network.Id)
      await networkInstance.remove()
    }
  }

  /**
   * Gets a Docker network by name
   * @param {Object} params
   * @param {string} params.networkName - Name of the network
   * @returns {Promise<Dockerode.Network>} Network object
   */
  getNetwork({ networkName }) {
    return this.client.getNetwork(networkName)
  }

  /**
   * Removes a Docker network if it exists
   * @param {Object} params
   * @param {string} params.networkName - Name of the network to remove
   * @returns {Promise<void>}
   */
  async removeNetwork({ networkName }) {
    try {
      const network = this.getNetwork({ networkName })
      await network.remove()
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error
      }
      // Network doesn't exist, that's fine
      this.logger.debug(
        `Network ${networkName} doesn't exist, skipping removal`,
      )
    }
  }
}

export { DockerClient }
