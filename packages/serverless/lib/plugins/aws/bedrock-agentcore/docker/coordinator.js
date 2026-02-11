'use strict'

/**
 * Docker build and push coordination for AgentCore runtimes
 *
 * Handles Docker image building and ECR pushing for runtime agents
 * that use container deployments.
 */

import { DockerBuilder } from './builder.js'

/**
 * Build Docker images for runtime agents (package phase - local only)
 *
 * @param {object} config - Configuration object
 * @param {object} config.aiConfig - AI configuration (ai: block from serverless.yml)
 * @param {object} config.ecrImages - ECR images from provider.ecr.images
 * @param {object} config.context - Service context
 * @param {object} config.serverless - Serverless instance
 * @param {object} config.log - Logger instance
 * @param {object} config.progress - Progress instance
 * @param {object} config.builtImages - Mutable map to store built image URIs
 * @param {array} config.buildMetadata - Mutable array to store build metadata for push phase
 * @returns {Promise<void>}
 */
export async function buildDockerImages(config) {
  const {
    aiConfig,
    ecrImages,
    context,
    serverless,
    log,
    progress,
    builtImages,
    buildMetadata,
  } = config

  if (!aiConfig?.agents) {
    return
  }

  const agents = aiConfig.agents

  // Find runtimes that need Docker builds
  const runtimesToBuild = []

  for (const [name, agentConfig] of Object.entries(agents)) {
    // All non-reserved keys are runtime agents
    // Check for Docker build config: artifact.image as object (not string URI)
    const artifactImage = agentConfig.artifact?.image
    if (artifactImage && typeof artifactImage === 'object') {
      // artifact.image is an object with build instructions
      runtimesToBuild.push({
        name,
        config: agentConfig,
        imageConfig: artifactImage,
      })
    } else if (
      !artifactImage && // No pre-built image URI
      !agentConfig.handler // No code deployment handler
    ) {
      // No explicit artifact configuration - auto-detect Dockerfile or use buildpacks
      log.info(
        `Runtime '${name}': No handler or artifact.image specified - using Dockerfile or auto-create Docker image`,
      )
      runtimesToBuild.push({
        name,
        config: agentConfig,
        imageConfig: { path: '.' },
      })
    }
  }

  if (runtimesToBuild.length === 0 && !ecrImages) {
    return
  }

  // Initialize Docker builder
  const builder = new DockerBuilder(serverless, log, progress)

  // Check Docker is available
  const dockerAvailable = await builder.checkDocker()
  if (!dockerAvailable) {
    throw new serverless.classes.Error(
      'Docker is required to build agent images but was not found. Please run or install Docker.',
    )
  }

  // Build images defined in provider.ecr.images (Serverless standard pattern)
  if (ecrImages) {
    log.info('Building ECR images...')
    // For now, keep the old behavior for provider.ecr.images (build + push)
    // TODO: Refactor processImages to also split build/push
    const processedImages = await builder.processImages(ecrImages, context)
    // Merge into builtImages
    Object.assign(builtImages, processedImages)
  }

  // Build images for runtimes with docker config (LOCAL BUILD ONLY)
  for (const { name, imageConfig } of runtimesToBuild) {
    // Handle string reference to provider.ecr.images
    if (typeof imageConfig === 'string') {
      if (builtImages[imageConfig]) {
        continue // Already built above
      }
    }

    // Build the image - imageConfig should have path, repository, or file
    const dockerConfig =
      typeof imageConfig === 'string' ? { name: imageConfig } : imageConfig

    if (dockerConfig.path || dockerConfig.repository || dockerConfig.file) {
      log.info(`Building Docker image for runtime: ${name}`)
      const buildMetadataItem = await builder.buildForRuntime(
        name,
        dockerConfig,
        context,
      )

      // Store image URI for CloudFormation
      builtImages[name] = buildMetadataItem.imageUri

      // Store metadata for push phase
      buildMetadata.push({ agentName: name, ...buildMetadataItem })
    }
  }
}

/**
 * Push Docker images to ECR (deploy phase)
 *
 * @param {object} config - Configuration object
 * @param {array} config.buildMetadata - Build metadata from build phase
 * @param {object} config.serverless - Serverless instance
 * @param {object} config.log - Logger instance
 * @param {object} config.progress - Progress instance
 * @returns {Promise<void>}
 */
export async function pushDockerImages(config) {
  const { buildMetadata, serverless, log, progress } = config

  if (buildMetadata.length === 0) {
    return
  }

  // Initialize Docker builder
  const builder = new DockerBuilder(serverless, log, progress)

  // Push all built images
  for (const metadata of buildMetadata) {
    log.info(`Pushing Docker image for runtime: ${metadata.agentName}`)
    await builder.pushForRuntime(metadata)
  }

  log.info('All Docker images pushed successfully')
}
