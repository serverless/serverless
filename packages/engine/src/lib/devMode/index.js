import { inspect } from 'node:util'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { setTimeout as asyncSetTimeout } from 'node:timers/promises'
import chokidar from 'chokidar'
import {
  ServerlessError,
  DockerClient,
  log,
  progress,
  style,
  colorizeString,
} from '@serverless/util'
import { AwsIamClient } from '../aws/iam.js'
import { getContainerEnvVars } from '../utils/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const logger = log.get('containers:dev-mode')
const containerProgress = progress.get('main')

// Increment version when the dev mode containers have changed
// to bust the users' cached versions of them
const CONTAINER_IMAGE_VERSION = 2
const CONTAINER_IMAGE_NODEJS_VERSION = 2
/**
 * Container configuration for dev mode
 * Add new runtimes here
 */
const CONTAINERS = {
  proxy: {
    network: 'serverless-dev-mode-proxy-network',
    name: 'serverless-dev-mode-proxy',
    image: {
      uri: `serverless-dev-mode-proxy:${CONTAINER_IMAGE_VERSION}`,
      path: path.resolve(__dirname, './containers/serverless-dev-mode-proxy'),
    },
  },
  runtimes: {
    nodejs: {
      20: {
        name: 'serverless-dev-mode-nodejs-20',
        image: {
          uri: `serverless-dev-mode-nodejs-20:${CONTAINER_IMAGE_NODEJS_VERSION}`,
          path: path.resolve(
            __dirname,
            './containers/serverless-dev-mode-nodejs-20',
          ),
        },
      },
    },
    python: {
      3.12: {
        name: 'serverless-dev-mode-python-3-12',
        image: {
          uri: `serverless-dev-mode-python-3-12:${CONTAINER_IMAGE_VERSION}`,
          path: path.resolve(
            __dirname,
            './containers/serverless-dev-mode-python-3-12',
          ),
        },
      },
    },
  },
}

/**
 * ServerlessEngineDevMode handles local development functionality including container management
 * and local proxy setup.
 */
export class ServerlessEngineDevMode {
  #projectPath
  #projectConfig
  #state
  #stage
  #provider
  #resourceNameBase
  #remoteUrl
  #docker
  #network
  #emulatedContainers
  #proxyContainer
  #watchers
  #rebuilding
  #logStreams
  #containersToRegister
  #isShuttingDown
  #pendingRebuilds
  #onStart
  #onLogStdOut
  #onLogStdErr
  #logStreamingPartialBuffer
  #proxyPort
  #controlPort
  #onDevModeStream

  /**
   * Creates a new ServerlessEngineDevMode instance and configures it for local development.
   *
   * @param {Object} options - Constructor options
   * @param {Object} options.state - The state store
   * @param {string} options.projectPath - The path to the root of the project which contains your container folders
   * @param {Object} options.projectConfig - The project configuration
   * @param {string} options.stage - The stage of deployment
   * @param {string} options.remoteUrl - The remote URL for proxying
   * @param {number} [options.proxyPort=3000] - Port for the main proxy server
   * @param {number} [options.controlPort=3001] - Port for the control server
   */
  constructor({
    state,
    projectPath,
    projectConfig,
    stage,
    provider,
    resourceNameBase,
    remoteUrl,
    proxyPort = 3000,
    controlPort = 3001,
  }) {
    this.#docker = new DockerClient()
    this.#emulatedContainers = new Map()
    this.#containersToRegister = []
    this.#network = null
    this.#watchers = new Map()
    this.#rebuilding = new Set()
    this.#logStreams = new Map()
    this.#isShuttingDown = false
    this.#logStreamingPartialBuffer = null

    this.#state = state
    this.#projectPath = projectPath
    this.#projectConfig = projectConfig
    this.#stage = stage
    this.#provider = provider
    this.#resourceNameBase = resourceNameBase
    this.#remoteUrl = remoteUrl
    this.#proxyPort = proxyPort
    this.#controlPort = controlPort
  }

  /**
   * Starts dev mode and initializes all containers
   * @returns {Promise<string[]>} Array of started container names
   */
  async start({ onStart, onLogStdOut, onLogStdErr, onDevModeStream } = {}) {
    // Set hooks
    this.#onStart = onStart
    this.#onLogStdOut = onLogStdOut
    this.#onLogStdErr = onLogStdErr
    this.#onDevModeStream = onDevModeStream

    // Ensure Docker is running
    await this.#docker.ensureIsRunning()

    try {
      // Initialize network and proxy
      containerProgress.update('Initializing Dev Mode local Docker network')
      this.#network = await this.#docker.getOrCreateNetwork({
        networkName: CONTAINERS.proxy.network,
      })
      await this.#initializeProxy()

      // Process containers sequentially instead of concurrently
      for (const [containerName, containerConfig] of Object.entries(
        this.#projectConfig.containers,
      )) {
        logger.debug('Creating and starting dev mode container', containerName)
        await this.#createAndStartDevModeContainer({
          containerName,
          containerConfig,
        })
      }

      await this.#registerContainers()

      // Fetch registered containers from proxy
      const response = await fetch(`http://localhost:${this.#controlPort}/info`)
      if (!response.ok) {
        throw new ServerlessError(
          `Proxy server failed to respond with locally registered containers for the Dev Mode session: ${response.statusText}`,
          'DEV_MODE_START_FAILED',
        )
      }
      const proxyData = await response.json()

      // Call onStart callback if provided
      if (this.#onStart) {
        await this.#onStart({
          proxyData,
          integrations:
            this.#state.state.containers?.service?.integrations ?? {},
          state: this.#state.state,
        })
      }

      if (this.#onDevModeStream) {
        this.#onDevModeStream()
      }

      // Remove progress spinner otherwise it conflicts with logs
      containerProgress.remove()

      // Start tailing logs for all containers
      const containerNames = Array.from(this.#emulatedContainers.keys())
      await this.#startLogTailing({ containerNames })

      return await this.#setupSignalHandlers()
    } catch (error) {
      // Attempt cleanup and re-throw error
      // Without this, containers will be left running
      await this.#cleanup('startup failure')
      const newError = new ServerlessError(
        `Failed to start dev mode: ${error.message}`,
        'DEV_MODE_START_FAILED',
        { stack: false },
      )
      throw newError
    }
  }

  /**
   * Initializes the proxy container
   * @returns {Promise<void>}
   * @private
   */
  async #initializeProxy() {
    containerProgress.update(`Initializing Dev Mode's local proxy`)

    // Check for existing proxy container
    this.#proxyContainer = await this.#docker.getContainerIfExists({
      containerName: CONTAINERS.proxy.name,
    })

    const isAiProject = this.#projectConfig.deployment.type.startsWith('sfai')

    if (!this.#proxyContainer) {
      // Build and create new container if it doesn't exist
      try {
        await this.#docker.buildImage({
          containerName: CONTAINERS.proxy.name,
          containerPath: CONTAINERS.proxy.image.path,
          imageUri: CONTAINERS.proxy.image.uri,
        })
      } catch (error) {
        logger.error(`Failed to build local proxy container: ${error.message}`)
        throw new ServerlessError(
          `Failed to build local proxy container: ${error.message}`,
          'DEV_MODE_START_FAILED',
        )
      }

      this.#proxyContainer = await this.#docker.createContainer({
        imageUri: CONTAINERS.proxy.image.uri,
        name: CONTAINERS.proxy.name,
        exposedPorts: {
          [`${this.#proxyPort}/tcp`]: {},
          [`${this.#controlPort}/tcp`]: {},
        },
        env: {
          TERM: 'xterm-256color',
          AI_FRAMEWORK: isAiProject ? 'true' : 'false',
          // Pass configured ports into the container via env variables
          PROXY_PORT: `${this.#proxyPort}`,
          CONTROL_PORT: `${this.#controlPort}`,
        },
        cmd: this.#remoteUrl ? [this.#remoteUrl] : [],
        hostConfig: {
          NetworkMode: CONTAINERS.proxy.network,
          PortBindings: {
            [`${this.#proxyPort}/tcp`]: [{ HostPort: `${this.#proxyPort}` }],
            [`${this.#controlPort}/tcp`]: [
              { HostPort: `${this.#controlPort}` },
            ],
          },
        },
      })
      logger.debug('Created local proxy container')
      await asyncSetTimeout(2500)
    }

    // Check if container is already running
    const inspectResponse = await this.#proxyContainer.inspect()
    if (!inspectResponse.State.Running) {
      await this.#proxyContainer.start()
      await asyncSetTimeout(5000)
    } else {
      logger.debug('Local proxy is already running')
    }
  }

  /**
   * Sets up AWS IAM credentials for a container if AWS IAM is configured
   * @param {Object} options - Options object
   * @param {string} options.namespace - Namespace for the container
   * @param {string} options.containerName - Name of the container
   * @param {Object} options.containerConfig - Container configuration
   * @returns {Promise<Object>} Updated container configuration
   * @private
   */
  async #integrateAwsIamRole({ containerName, containerConfig }) {
    logger.debug(
      `${containerName}: Integrating live AWS IAM role with local container`,
    )

    // If no AWS IAM is configured, we cannot proceed
    if (!containerConfig.compute.awsIam) {
      logger.debug(
        `${containerName}: No AWS IAM role is configured for this container, skipping integration`,
      )
      return containerConfig
    }

    // If the architecture is not deployed, we cannot proceed
    if (!this.#state.state.isDeployed) {
      if (containerConfig.compute.awsIam) {
        logger.warning(
          `${containerName}: This container isn't deployed. Therefore, no live AWS IAM Role exists yet to integrate with this container locally, possibly causing permission errors. Deploy the project first, then rerun dev mode to use your live AWS IAM Role with this local container.`,
        )
      }
      return containerConfig
    }

    const iamClient = new AwsIamClient(this.#provider.aws)
    const updatedConfig = { ...containerConfig }

    let awsIamCallerIdentity
    try {
      awsIamCallerIdentity = await iamClient.getCallerIdentity()
    } catch (error) {
      // If we fail to get the caller identity, we can't proceed
      logger.debug(
        `${containerName}: Failed to get AWS IAM caller identity: ${error.message}`,
      )
      return containerConfig
    }

    if (awsIamCallerIdentity?.Arn) {
      try {
        containerProgress.update(
          `${containerName}: Ensuring IAM role enabled for local development`,
        )
        await iamClient.ensureLocalDevelopmentTrustPolicy({
          resourceNameBase: this.#resourceNameBase,
          containerName,
          iamEntityArn: awsIamCallerIdentity.Arn,
        })
      } catch (error) {
        logger.warning(
          `${containerName}: Failed to ensure local development trust policy: ${error.message}`,
        )
        // If we fail to ensure the local development trust policy, we can't proceed
        logger.debug(
          `${containerName}: Failed to ensure local development trust policy: ${error.message}`,
        )
        return containerConfig
      }
    }

    let awsIamRoleTempCredentials
    try {
      containerProgress.update(
        `${containerName}: Getting temporary credentials for IAM role`,
      )
      awsIamRoleTempCredentials = await iamClient.getTemporaryCredentialsForDev(
        {
          resourceNameBase: this.#resourceNameBase,
          containerName,
        },
      )
    } catch (error) {
      // If we fail to get temporary credentials, we can't proceed
      logger.debug(
        `${containerName}: Failed to get temporary credentials for IAM role: ${error.message}`,
      )
      return containerConfig
    }

    // Add the temporary credentials to the container config as env
    if (
      awsIamRoleTempCredentials?.AccessKeyId &&
      awsIamRoleTempCredentials?.SecretAccessKey &&
      awsIamRoleTempCredentials?.SessionToken
    ) {
      updatedConfig.environment = {
        ...updatedConfig.environment,
        AWS_ACCESS_KEY_ID: awsIamRoleTempCredentials.AccessKeyId,
        AWS_SECRET_ACCESS_KEY: awsIamRoleTempCredentials.SecretAccessKey,
        AWS_SESSION_TOKEN: awsIamRoleTempCredentials.SessionToken,
      }
    }

    return updatedConfig
  }

  /**
   * Registers and starts a service container
   * @param {Object} options - Container options
   * @param {string} options.containerName - Service name
   * @param {Object} options.containerConfig - Container configuration
   * @param {string} options.projectPath - Root path
   * @returns {Promise<void>}
   */
  async #createAndStartDevModeContainer({ containerName, containerConfig }) {
    containerProgress.update(
      `Initializing "${containerName}" for "${containerConfig.compute.type}" local development`,
    )

    // Integrate live AWS IAM role with local container
    containerConfig = await this.#integrateAwsIamRole({
      containerName,
      containerConfig,
    })

    containerProgress.update(
      `Creating "${containerName}" for "${containerConfig.compute.type}" local development`,
    )
    const devModeContainerCreator = await this.#getDevModeContainerCreator({
      containerName,
      containerConfig,
    })

    await devModeContainerCreator()

    this.#containersToRegister.push({
      containerName,
      containerConfig,
    })
  }

  /**
   * Gets the appropriate container creator for a service
   * @returns {Promise<Function>} Runtime handler function
   * @private
   */
  async #getDevModeContainerCreator({ containerName, containerConfig }) {
    const containerPath = path.join(this.#projectPath, containerConfig.src)

    const isAiProject = this.#projectConfig.deployment.type.startsWith('sfai')

    // Check files in parallel for better performance
    const [hasDockerfile, hasPackageJson, hasRequirements] = await Promise.all([
      fsp
        .access(path.join(containerPath, 'Dockerfile'))
        .then(() => true)
        .catch(() => {
          if (containerConfig.build?.dockerFileString) {
            return true
          } else {
            return false
          }
        }),
      fsp
        .access(path.join(containerPath, 'package.json'))
        .then(() => true)
        .catch(() => false),
      fsp
        .access(path.join(containerPath, 'requirements.txt'))
        .then(() => true)
        .catch(() => false),
    ])

    // Dockerfile
    if (hasDockerfile) {
      return async () =>
        this.#runLocalDockerfileContainer({
          containerName,
          containerPath,
          containerConfig,
          isAiProject,
        })
    }
    // Node.js
    if (hasPackageJson) {
      return async () =>
        this.#runLocalNodejsContainer({
          containerName,
          containerPath,
          containerConfig,
        })
    }
    // Python
    if (hasRequirements) {
      return async () =>
        this.#runLocalPythonContainer({
          containerName,
          containerPath,
          containerConfig,
        })
    }

    // Only support Dockerfile, package.json, and requirements.txt for now
    throw new ServerlessError(
      `"${containerName}" has no Dockerfile, package.json, or requirements.txt in ${containerPath}. One of these is required at this time.`,
      'DEV_MODE_START_FAILED',
    )
  }

  /**
   * Runs a Dockerfile-based service locally
   * @param {Object} options - Service options
   * @param {string} options.containerName - Container name
   * @param {string} options.containerPath - Container directory path
   * @param {Object} options.containerConfig - Container configuration
   * @returns {Promise<void>}
   * @private
   */
  async #runLocalDockerfileContainer({
    containerName,
    containerPath,
    containerConfig,
    isAiProject,
  }) {
    containerProgress.update(
      `Building "${containerName}" for "${containerConfig.compute.type}" local development via Dockerfile`,
    )

    await this.#docker.buildImage({
      containerName,
      containerPath,
      imageUri: `${containerName}:local`,
      dockerFileString: containerConfig.build?.dockerFileString,
      buildArgs: containerConfig.build?.args,
    })
    await this.#runLocalCustomContainer({
      containerName,
      containerConfig,
      containerPath,
      isAiProject,
    })
    if (!isAiProject) {
      await this.#watchAndRebuild({
        containerName,
        containerPath,
        containerConfig,
      })
    }
  }

  /**
   * Runs a Node.js service locally
   * @param {Object} options - Service options
   * @param {string} options.containerName - Container name
   * @param {string} options.containerPath - Container directory path
   * @param {Object} options.containerConfig - Container configuration
   * @returns {Promise<void>}
   * @private
   */
  async #runLocalNodejsContainer({
    containerName,
    containerPath,
    containerConfig,
  }) {
    // We don't want to show the progress spinner if a rebuild is happening
    // Because it will break the UX
    if (this.#rebuilding.size > 0) {
      logger.debug(
        `${containerName}: Building for "${containerConfig.compute.type}" local development via Node.js`,
      )
    } else {
      containerProgress.update(
        `${containerName}: Building for "${containerConfig.compute.type}" local development via Node.js`,
      )
    }

    const packageJson = JSON.parse(
      await fsp.readFile(path.join(containerPath, 'package.json'), 'utf8'),
    )
    const mainFile = packageJson.main ?? 'index.js'

    // If no "main" file is found, we need to warn the user
    if (!packageJson.main) {
      logger.warning(
        `${containerName}: No "main" file found in package.json. Defaulting to "index.js"`,
      )
    }

    // Remove existing container if it exists
    await this.#docker.removeContainer({ containerName })

    // Build or use cached Node.js base image
    try {
      await this.#docker.getImage(CONTAINERS.runtimes.nodejs['20'].image.uri)
      logger.debug(`${containerName}: Using cached Node.js base image`)
    } catch (error) {
      logger.debug(`${containerName}: Building Node.js base image`)
      await this.#docker.buildImage({
        containerPath: CONTAINERS.runtimes.nodejs['20'].image.path,
        imageUri: CONTAINERS.runtimes.nodejs['20'].image.uri,
      })
    }

    const nodeModulePath = path.join(containerPath, 'node_modules')
    const hasNodeModules = await fsp
      .access(nodeModulePath)
      .then(() => true)
      .catch(() => false)

    if (!hasNodeModules) {
      throw new ServerlessError(
        `node_modules directory not found at ${nodeModulePath}. Install your dependencies to enable Dev Mode to work.`,
        'LOCAL_NODE_MODULES_NOT_FOUND',
        {
          stack: false,
        },
      )
    }

    const cmd = [`--entrypoint=${mainFile}`]

    if (containerConfig.dev?.hooks?.onreload) {
      cmd.push(`--onreload="${containerConfig.dev.hooks.onreload}"`)
    }

    if (containerConfig.dev?.watchExtensions) {
      containerConfig.dev.watchExtensions.forEach((ext) => {
        cmd.push(`--extensions=${ext}`)
      })
    }

    if (containerConfig.dev?.excludeDirectories) {
      containerConfig.dev.excludeDirectories.forEach((dir) => {
        cmd.push(`--exclude-directories=${dir}`)
      })
    }

    const container = await this.#docker.createContainer({
      imageUri: CONTAINERS.runtimes.nodejs['20'].image.uri,
      name: containerName,
      exposedPorts: {
        '8080/tcp': {},
        '9000/tcp': {},
      },
      labels: {
        'com.serverless.dev-mode-local-proxy': 'true',
      },
      hostConfig: {
        NetworkMode: CONTAINERS.proxy.network,
        Binds: [`${containerPath}:/shim/app`],
      },
      env: {
        ...getContainerEnvVars({
          name: this.#projectConfig.name,
          stage: this.#stage,
          containerName,
          computeType: containerConfig.compute.type,
          routingPathPattern: containerConfig.routing?.pathPattern,
          environment: containerConfig.environment,
          port: 8080,
          localProxyPort: this.#proxyPort,
          isLocal: true,
        }),
      },
      cmd,
    })

    await container.start()

    // Wait for 5 seconds to ensure the container is ready
    await asyncSetTimeout(5000)

    this.#emulatedContainers.set(containerName, container)
  }

  /**
   * Runs a Python service locally
   * @param {Object} options - Service options
   * @param {string} options.containerName - Container name
   * @param {string} options.containerPath - Container directory path
   * @param {Object} options.containerConfig - Container configuration
   * @returns {Promise<void>}
   * @private
   */
  async #runLocalPythonContainer({
    containerName,
    containerPath,
    containerConfig,
  }) {
    // We don't want to show the progress spinner if a rebuild is happening
    // Because it will break the UX
    if (this.#rebuilding.size > 0) {
      logger.debug(
        `${containerName}: Building for "${containerConfig.compute.type}" local development via Python`,
      )
    } else {
      containerProgress.update(
        `${containerName}: Building for "${containerConfig.compute.type}" local development via Python`,
      )
    }

    // Remove existing container if it exists
    await this.#docker.removeContainer({ containerName })

    // Build or use cached Python base image
    try {
      await this.#docker.getImage(CONTAINERS.runtimes.python['3.12'].image.uri)
      logger.debug(`${containerName}: Using cached Python base image`)
    } catch (error) {
      logger.debug(`${containerName}: Building Python base image`)
      await this.#docker.buildImage({
        containerPath: CONTAINERS.runtimes.python['3.12'].image.path,
        imageUri: CONTAINERS.runtimes.python['3.12'].image.uri,
      })
    }

    const container = await this.#docker.createContainer({
      imageUri: CONTAINERS.runtimes.python['3.12'].image.uri,
      name: containerName,
      exposedPorts: {
        '8080/tcp': {},
        '9000/tcp': {},
      },
      labels: {
        'com.serverless.dev-mode-local-proxy': 'true',
      },
      env: {
        ...getContainerEnvVars({
          name: this.#projectConfig.name,
          stage: this.#stage,
          containerName,
          computeType: containerConfig.compute.type,
          routingPathPattern: containerConfig.routing?.pathPattern,
          environment: containerConfig.environment,
          port: 8080,
          localProxyPort: this.#proxyPort,
          isLocal: true,
        }),
        ...containerConfig.compute.environment,
      },
      hostConfig: {
        NetworkMode: CONTAINERS.proxy.network,
        Binds: [`${containerPath}:/app`],
      },
      cmd: ['main.py'],
    })

    await container.start()
    await asyncSetTimeout(5000)
    this.#emulatedContainers.set(containerName, container)
  }

  /**
   * Runs a service locally
   * @param {Object} options - Service options
   * @param {string} options.containerName - Container name
   * @param {Object} options.containerConfig - Container configuration
   * @returns {Promise<void>}
   * @private
   */
  async #runLocalCustomContainer({
    containerName,
    containerConfig,
    containerPath,
    isAiProject,
  }) {
    // See if a rebuild is happening w/ any container
    // We don't want to show the progress spinner if a rebuild is happening because it will break the UX
    if (this.#rebuilding.size > 0) {
      logger.debug(`${containerName}: Starting local container`)
    } else {
      containerProgress.update(`${containerName}: Starting local container`)
    }

    const imageUri = `${containerName}:local`

    // Remove existing container if it exists
    await this.#docker.removeContainer({ containerName })

    const container = await this.#docker.createContainer({
      imageUri,
      name: containerName,
      exposedPorts: {
        '8080/tcp': {},
        '9000/tcp': {},
      },
      labels: {
        'com.serverless.dev-mode-local-proxy': 'true',
      },
      env: {
        ...getContainerEnvVars({
          name: this.#projectConfig.name,
          stage: this.#stage,
          containerName,
          computeType: containerConfig.compute.type,
          routingPathPattern: containerConfig.routing?.pathPattern,
          environment: containerConfig.environment,
          port: 8080,
          localProxyPort: this.#proxyPort,
          isLocal: true,
        }),
        ...containerConfig.compute.environment,
      },
      hostConfig: {
        NetworkMode: CONTAINERS.proxy.network,
        Binds: isAiProject ? [`${containerPath}:/shim/app`] : [],
      },
    })

    await container.start()
    await asyncSetTimeout(5000)
    this.#emulatedContainers.set(containerName, container)
  }

  /**
   * Registers containers with the proxy
   * @returns {Promise<void>}
   * @private
   */
  async #registerContainers() {
    const registerBody = JSON.stringify(
      this.#containersToRegister.map(({ containerName, containerConfig }) => ({
        service: containerName,
        url: `http://${containerName}:${8080}${containerConfig.routing?.pathPattern ?? ''}`,
        path: containerConfig.routing.pathPattern,
        invokeType: containerConfig.compute.type,
      })),
    )

    logger.debug(`Registering response: ${registerBody}`)

    // Use the dynamic control port from the container's network settings
    const containerInfo = await this.#proxyContainer.inspect()
    const controlPort =
      containerInfo.NetworkSettings.Ports[`${this.#controlPort}/tcp`][0]
        .HostPort

    const registerResponse = await fetch(
      `http://localhost:${controlPort}/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: registerBody,
      },
    )

    if (!registerResponse.ok) {
      const errorBody = await registerResponse.text()
      throw new Error(
        `Failed to register proxies: ${registerResponse.statusText} - ${errorBody}`,
      )
    }
  }

  /**
   * Watches a service directory and rebuilds on changes
   * @param {Object} options - Watch options
   * @param {string} options.containerName - Container name
   * @param {string} options.containerPath - Container directory path
   * @param {Object} options.containerConfig - Container configuration
   * @returns {Promise<void>}
   * @private
   */
  async #watchAndRebuild({ containerName, containerPath, containerConfig }) {
    if (this.#watchers.has(containerName)) {
      await this.#watchers.get(containerName).close()
    }

    // Initialize pendingRebuilds if not exists
    if (!this.#pendingRebuilds) {
      this.#pendingRebuilds = new Map()
    }

    // Build the list of user-configured directories to exclude (as absolute paths)
    const userExcludedDirs = (
      containerConfig.dev?.excludeDirectories ?? []
    ).map((dir) => path.join(containerPath, dir))

    const watcher = chokidar.watch(containerPath, {
      // chokidar v4 removed glob support, using function-based filter instead
      ignored: (filePath, stats) => {
        // Ignore common directories that should never trigger rebuilds
        // Check both "/dir/" pattern (for absolute paths) and "dir/" at start (for relative paths)
        if (
          filePath.includes('/node_modules/') ||
          filePath.startsWith('node_modules/') ||
          filePath.includes('/.git/') ||
          filePath.startsWith('.git/') ||
          filePath.includes('/coverage/') ||
          filePath.startsWith('coverage/') ||
          filePath.includes('/test/') ||
          filePath.startsWith('test/')
        ) {
          return true
        }
        // Ignore test files (only check file extension for actual files)
        if (
          stats?.isFile() &&
          (filePath.endsWith('.test.js') || filePath.endsWith('.spec.js'))
        ) {
          return true
        }
        // Ignore user-configured directories
        if (
          userExcludedDirs.some(
            (dir) => filePath.startsWith(dir + path.sep) || filePath === dir,
          )
        ) {
          return true
        }
        return false
      },
      ignoreInitial: true,
      followSymlinks: false,
      // Add debounce to prevent rapid-fire events
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    })

    watcher.on('all', async (event, filePath) => {
      const extension = path.extname(filePath)
      if (
        containerConfig.dev?.watchExtensions &&
        !containerConfig.dev.watchExtensions.includes(extension)
      ) {
        return
      }

      // Only log if not already rebuilding
      if (!this.#rebuilding.has(containerName)) {
        this.#entityLogNotice(
          containerName,
          `Detected ${event} in ${path.relative(
            containerPath,
            filePath,
          )}. Rebuilding...`,
        )
      } else {
        logger.warning(
          `${containerName}: Already rebuilding, queueing this change for later`,
        )
      }

      await this.#performRebuild({
        containerName,
        containerPath,
        containerConfig,
        event,
        filePath,
      })
    })

    this.#watchers.set(containerName, watcher)
  }

  /**
   * Performs the actual rebuild of a container
   * @param {Object} options - Rebuild options
   * @param {string} options.containerName - Container name
   * @param {string} options.containerPath - Container path
   * @param {Object} options.containerConfig - Container configuration
   * @param {string} options.event - File event that triggered rebuild
   * @param {string} options.filePath - Path of changed file
   * @returns {Promise<void>}
   * @private
   */
  async #performRebuild({
    containerName,
    containerPath,
    containerConfig,
    event,
    filePath,
  }) {
    // If already rebuilding, don't start another rebuild
    if (this.#rebuilding.has(containerName)) {
      this.#pendingRebuilds.set(containerName, { event, filePath })
      return
    }

    this.#rebuilding.add(containerName)

    try {
      // Add small delay to allow filesystem to settle
      await asyncSetTimeout(100)

      await this.#docker.buildImage({
        containerName,
        containerPath,
        imageUri: `${containerName}:local`,
        dockerFileString: containerConfig.build?.dockerFileString,
        buildArgs: containerConfig.build?.args,
      })

      const container = this.#emulatedContainers.get(containerName)
      if (container) {
        const inspectResponse = await container.inspect()
        if (inspectResponse.State.Running) {
          await container.kill()
        }
        await container.remove()
      }

      await this.#runLocalCustomContainer({
        containerName,
        containerConfig,
      })

      // Add log tailing for the new container
      await this.#restartLogTailing({
        containerName,
      })

      this.#entityLogNotice(containerName, 'Rebuild complete')

      // Process any pending rebuilds after a short delay
      await asyncSetTimeout(500)
      const pendingRebuild = this.#pendingRebuilds.get(containerName)
      if (pendingRebuild) {
        this.#pendingRebuilds.delete(containerName)
        this.#entityLogNotice(containerName, 'Processing queued rebuild')
        this.#rebuilding.delete(containerName) // Clear rebuilding flag before starting next rebuild
        await this.#performRebuild({
          containerName,
          containerPath,
          containerConfig,
          event: pendingRebuild.event,
          filePath: pendingRebuild.filePath,
        })
      }
    } catch (error) {
      this.#entityLogError(containerName, `Rebuild failed: ${error.message}`)
    } finally {
      if (!this.#pendingRebuilds.has(containerName)) {
        this.#rebuilding.delete(containerName)
      }
    }
  }

  /**
   * Starts log tailing for all containers, including the local proxy
   * @param {string[]} containerNames - Names of containers to tail logs for
   * @returns {Promise<void>}
   * @private
   */
  async #startLogTailing({ containerNames }) {
    console.log('')
    await Promise.all([
      ...containerNames.map((containerName) =>
        this.#restartLogTailing({ containerName }),
      ),
      // Add log tailing for the local proxy
      this.#restartLogTailing({
        containerName: CONTAINERS.proxy.name,
      }),
    ])
  }

  /**
   * Restarts log tailing for a container
   * @param {string} containerName - Name of the container
   * @returns {Promise<void>}
   * @private
   */
  async #restartLogTailing({ containerName }) {
    logger.debug(`Starting/restarting log tailing for ${containerName}`)

    if (this.#logStreams.has(containerName)) {
      this.#logStreams.get(containerName).destroy()
      this.#logStreams.delete(containerName)
    }

    // Log handler
    const onData = (data) => {
      const { stdout, stderr } = this.#demuxOutput(data)
      const isAiProject = this.#projectConfig.deployment.type.startsWith('sfai')
      if (stdout && !this.#isLogALambdaRIELog(stdout) && stdout.trim() !== '') {
        if (containerName === CONTAINERS.proxy.name) {
          if (this.#onLogStdOut) {
            this.#onLogStdOut(stdout)
          } else {
            try {
              const { service: serviceName, args } = JSON.parse(stdout)
              const service = isAiProject ? 'agent' : serviceName
              logger.write(
                `${colorizeString(`[${service}]`)}`,
                ...args.map((str) => this.#sanitizeLogs(str)),
              )
              logger.write('\n')
            } catch (error) {
              // Ignore parse errors
            }
          }
        } else {
          // If onStdOut is provided, use it
          if (this.#onLogStdOut) {
            // Sanitize logs before passing to onStdOut
            this.#onLogStdOut(this.#sanitizeLogs(stdout))
          } else {
            const serviceName = isAiProject ? 'agent' : containerName
            // Otherwise, use the default behavior
            try {
              const parsed = JSON.parse(stdout.trim())
              const formatted = inspect(parsed, { colors: true, depth: null })
              process.stdout.write(
                `${colorizeString(`[${serviceName}]`)} ${formatted}\n`,
              )
            } catch (error) {
              process.stdout.write(
                `${colorizeString(`[${serviceName}]`)} ${this.#sanitizeLogs(stdout)}`,
              )
            }
          }
        }
      }
      if (stderr && !this.#isLogALambdaRIELog(stderr) && stderr.trim() !== '') {
        if (containerName === CONTAINERS.proxy.name) {
          if (this.#onLogStdErr) {
            this.#onLogStdErr(stderr)
          } else {
            try {
              const { service: serviceName, args } = JSON.parse(stderr)
              const service = isAiProject ? 'agent' : serviceName
              logger.write(
                `${colorizeString(`[${service}]`)}`,
                ...args.map((str) => style.error(this.#sanitizeLogs(str))),
              )
              logger.write('\n')
            } catch (error) {
              // Ignore parse errors
            }
          }
        } else {
          // If onStdErr is provided, use it
          if (this.#onLogStdErr) {
            // Sanitize logs before passing to onStdErr
            this.#onLogStdErr(this.#sanitizeLogs(stderr))
          } else {
            const serviceName = isAiProject ? 'agent' : containerName
            // Otherwise, use the default behavior
            try {
              const parsed = JSON.parse(stderr.trim())
              const formatted = inspect(parsed, { colors: false, depth: null })
              process.stderr.write(
                `${colorizeString(`[${serviceName}]`)} ${style.error(formatted)}\n`,
              )
            } catch (error) {
              process.stderr.write(
                `${colorizeString(`[${serviceName}]`)} ${style.error(this.#sanitizeLogs(stderr))}`,
              )
            }
          }
        }
      }
    }

    const onError = (error) => {
      logger.error(`Error tailing logs for ${containerName}: ${error.message}`)
    }

    const onEnd = () => {
      logger.debug(`Ending log tailing for ${containerName}`)
    }

    const stream = await this.#docker.tailLogs({
      containerName,
      onData,
      onError,
      onEnd,
    })

    this.#logStreams.set(containerName, stream)
  }

  /**
   * Checks if a log line is from Lambda RIE
   * @param {string} str - Log line to check
   * @returns {boolean} True if log is from Lambda RIE
   * @private
   */
  #isLogALambdaRIELog(str) {
    const RIELogTokens = [
      '[ERROR]',
      '[WARN] (rapid)',
      '[INFO] (rapid)',
      '[DEBUG] (rapid)',
      'START RequestId:',
      'END RequestId:',
      'REPORT RequestId:',
      'Duration:',
      'Billed Duration:',
      'Memory Size:',
      'Max Memory Used:',
      'Init Duration:',
      'Overall Duration:',
    ]
    return RIELogTokens.some((token) => str.includes(token))
  }

  /**
   * Sanitizes logs
   * @param {string} str - Log line to parse
   * @returns {string} Parsed log line
   * @private
   */
  #sanitizeLogs(str) {
    // Remove HPM tags
    const cleanedStr = str.replace('[HPM] ', '')

    // Truncate stack traces for error messages
    if (
      cleanedStr.includes('SyntaxError:') ||
      cleanedStr.includes('TypeError:') ||
      cleanedStr.includes('ReferenceError:') ||
      cleanedStr.includes('Error:')
    ) {
      // Split by newlines
      const lines = cleanedStr.split('\n')

      // Find error message line and keep only a few relevant lines
      const errorLineIndex = lines.findIndex(
        (line) =>
          line.includes('SyntaxError:') ||
          line.includes('TypeError:') ||
          line.includes('ReferenceError:') ||
          line.includes('Error:'),
      )

      if (errorLineIndex !== -1) {
        // Keep only the important context: lines before error, error line, and next line if available
        const startIndex = Math.max(0, errorLineIndex - 2)
        const endIndex = Math.min(errorLineIndex + 2, lines.length)
        const relevantLines = lines.slice(startIndex, endIndex)

        // Filter out the Node.js version line if it exists
        return (
          relevantLines
            .filter((line) => !line.trim().match(/^Node\.js v\d+\.\d+\.\d+$/))
            .join('\n') + '\n'
        )
      }
    }

    return cleanedStr
  }

  /**
   * Demuxes Docker log output
   * @param {Buffer} buffer - Docker log output buffer
   * @returns {{stdout: string, stderr: string}} Demuxed output
   * @private
   */
  #demuxOutput(buffer) {
    const stdouts = []
    const stderrs = []

    // Initialize or use existing partial buffer
    if (!this.#logStreamingPartialBuffer) {
      this.#logStreamingPartialBuffer = Buffer.alloc(0)
    }

    // Combine new data with any partial buffer
    this.#logStreamingPartialBuffer = Buffer.concat([
      this.#logStreamingPartialBuffer,
      buffer,
    ])

    while (this.#logStreamingPartialBuffer.length >= 8) {
      // Need at least header size
      try {
        // Read frame header
        const streamType = this.#logStreamingPartialBuffer.readUInt8(0)
        const payloadLength = this.#logStreamingPartialBuffer.readUInt32BE(4)
        const frameSize = 8 + payloadLength // header + payload

        // Check if we have the complete frame
        if (this.#logStreamingPartialBuffer.length < frameSize) {
          break // Wait for more data
        }

        // Extract the frame
        const frame = this.#logStreamingPartialBuffer.slice(8, frameSize)

        // Add to appropriate output buffer
        if (streamType === 1) {
          stdouts.push(frame)
        } else if (streamType === 2) {
          stderrs.push(frame)
        }

        // Remove processed frame from partial buffer
        this.#logStreamingPartialBuffer =
          this.#logStreamingPartialBuffer.slice(frameSize)
      } catch (error) {
        // If we encounter any error processing the frame,
        // clear the partial buffer to avoid cascading errors
        this.#logStreamingPartialBuffer = Buffer.alloc(0)
        break
      }
    }

    // If partial buffer gets too large, clear it to prevent memory issues
    if (this.#logStreamingPartialBuffer.length > 1024 * 1024) {
      // 1MB limit
      this.#logStreamingPartialBuffer = Buffer.alloc(0)
    }

    return {
      stdout: Buffer.concat(stdouts).toString('utf8'),
      stderr: Buffer.concat(stderrs).toString('utf8'),
    }
  }

  /**
   * Stops multiple containers
   * @param {string[]} containerNames - Names of containers to stop
   * @returns {Promise<void>}
   */
  async #stopMultiple(containerNames) {
    containerProgress.update('Closing Dev Mode')

    const serviceContainers = containerNames.map(async (containerName) => {
      // Kill log streams first, otherwise they will continue to write to the console
      if (this.#logStreams.has(containerName)) {
        this.#logStreams.get(containerName).destroy()
        this.#logStreams.delete(containerName)
      }

      // Stop the watcher
      if (this.#watchers.has(containerName)) {
        await this.#watchers.get(containerName).close()
        this.#watchers.delete(containerName)
      }
      this.#rebuilding.delete(containerName)

      // Kill the container
      const container = this.#emulatedContainers.get(containerName)
      if (container) {
        const inspectResponse = await container.inspect()
        if (inspectResponse.State.Running) {
          await container.kill()
        }
        await container.remove()
      }
    })

    await Promise.all(serviceContainers)

    if (this.#proxyContainer) {
      const inspectResponse = await this.#proxyContainer.inspect()
      if (inspectResponse.State.Running) {
        await this.#proxyContainer.kill()
      }
      await this.#proxyContainer.remove()
    }
  }

  /**
   * Performs cleanup of all resources
   * @param {string} reason - Reason for cleanup
   * @returns {Promise<void>}
   * @private
   */
  async #cleanup(reason) {
    try {
      logger.debug(`Cleaning up resources (${reason})`)
      const containerNames = Array.from(this.#emulatedContainers.keys())
      await this.#stopMultiple(containerNames)

      if (this.#network) {
        await this.#docker.removeNetwork({
          networkName: CONTAINERS.proxy.network,
        })
      }
    } catch (error) {
      logger.debug(`Cleanup error: ${error.message}`)
    }
  }

  /**
   * Sets up signal handlers for graceful shutdown.
   *
   * This method listens for SIGINT and SIGTERM (as well as uncaught exceptions and unhandled rejections)
   * and requires the user to press Ctrl+C twice within a 4-second window to trigger a shutdown.
   * If a second press is not detected within the timeframe, the confirmation resets.
   *
   * @private
   * @returns {Promise<void>} Resolves when shutdown is complete.
   */
  #setupSignalHandlers() {
    return new Promise((resolve) => {
      let firstPressTime = null
      const DOUBLE_PRESS_TIMEOUT = 4000 // 4 seconds

      /**
       * Handles the shutdown procedure.
       *
       * @param {Object} options - Options object
       * @param {string} options.reason - Reason for shutdown
       */
      const handleShutdown = async ({ reason }) => {
        if (this.#isShuttingDown) {
          return
        }
        this.#isShuttingDown = true

        // Only map technical reasons that need translation
        const shutdownReasons = {
          SIGINT: 'User requested shutdown',
          SIGTERM: 'Termination request',
          uncaughtException: 'Unexpected error',
          unhandledRejection: 'Unhandled promise rejection',
        }

        containerProgress.update('Stopping containers')
        const friendlyReason = shutdownReasons[reason] || reason
        logger.aside(
          `\nGracefully shutting down Dev Mode... (${friendlyReason})`,
        )

        try {
          await this.#cleanup(friendlyReason)
          logger.success('Dev Mode shutdown complete')
          resolve()
        } catch (error) {
          logger.error(`Error during shutdown: ${error.message}`)
          resolve()
        }
      }

      /**
       * Handles a signal event.
       *
       * @param {Object} options - Options object
       * @param {string} options.signal - Signal received
       */
      const handleSignal = ({ signal }) => {
        if (this.#isShuttingDown) {
          return
        }

        const currentTime = Date.now()

        // If no press yet or the previous press was too long ago, reset confirmation
        if (
          !firstPressTime ||
          currentTime - firstPressTime > DOUBLE_PRESS_TIMEOUT
        ) {
          firstPressTime = currentTime
          logger.blankLine()
          logger.notice(
            '\nPress Ctrl+C again within 4 seconds to exit Dev Mode...',
          )
        } else {
          handleShutdown({ reason: signal })
        }
      }

      const signals = ['SIGINT', 'SIGTERM']
      signals.forEach((signal) => {
        process.on(signal, () => handleSignal({ signal }))
      })

      // Handle uncaught exceptions and unhandled rejections
      process.on('uncaughtException', (error) => {
        logger.error(`Unexpected error: ${error.message}`)
        handleShutdown({ reason: 'uncaughtException' })
      })

      process.on('unhandledRejection', (error) => {
        logger.error(`Unhandled promise rejection: ${error.message}`)
        handleShutdown({ reason: 'unhandledRejection' })
      })
    })
  }

  /**
   * Logs a notice message with an entity prefix
   * @param {string} entity - The entity to prefix the log with
   * @param {...any} args - Arguments to log
   * @private
   */
  #entityLogNotice(entity, ...args) {
    logger.notice(`${colorizeString(`[${entity}]`)}: ${args.join(' ')}`)
  }

  /**
   * Logs an error message with an entity prefix
   * @param {string} entity - The entity to prefix the log with
   * @param {...any} args - Arguments to log
   * @private
   */
  #entityLogError(entity, ...args) {
    logger.error(`${colorizeString(`[${entity}]`)}: ${args.join(' ')}`)
  }
}
