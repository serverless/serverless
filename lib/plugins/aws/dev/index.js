import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import util from 'util'
import archiver from 'archiver'
import iot from 'aws-iot-device-sdk'
import chokidar from 'chokidar'
import utils from '@serverlessinc/sf-core/src/utils.js'
import validate from '../lib/validate.js'
import ServerlessError from '@serverlessinc/sf-core/src/utils/errors/serverlessError.js'
import LocalLambda from './local-lambda/index.js'
import { fileURLToPath } from 'url'
import { isDashboardObservabilityEnabled } from '../../observability/dashboard/index.js'

const { log, progress, stringToSafeColor } = utils
const logger = log.get('sls:dev')

let __dirname = path.dirname(fileURLToPath(import.meta.url))

if (__dirname.endsWith('dist')) {
  __dirname = path.join(__dirname, '../lib/plugins/aws/dev')
}

/**
 * Constructs an instance of the dev mode plugin, setting up initial properties
 * and configuring hooks based on command inputs.
 *
 * @constructor
 * @param {Object} serverless - The serverless instance
 * @param {Object} [options={}] - The options passed to the plugin, with
 * defaults to an empty object if not provided.
 */
class AwsDev {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.originalFunctionConfigs = {}

    Object.assign(this, validate)

    this.commands = {
      'dev-build': {
        groupName: 'main',
        options: {},
        usage: 'Runs Dev Mode invocation',
        lifecycleEvents: ['build'],
        serviceDependencyMode: 'required',
        hasAwsExtension: true,
        type: 'entrypoint',
      },
    }
    this.hooks = {}
    /**
     * We need to pack and deploy the dev mode shim only when running the dev command.
     * Since hooks are registered for all plugins regardless of the command, we need to
     * make sure we only overwrite the default packaging behavior in the case of dev mode
     */
    if (this.serverless.processedInput.commands.includes('dev')) {
      this.hooks['before:package:createDeploymentArtifacts'] = async () =>
        await this.pack()
    }

    /**
     * I haven't put too much thought into the hooks we want to expose, but this is good enough for now.
     */
    this.hooks['dev:dev'] = async () => await this.dev()
    this.hooks['dev-build:build'] = async () => {}
  }

  /**
   * The main handler for dev mode. Steps include:
   * - Packaging the shim and setting it as the service deployment artifact.
   * - Updating the service to use the shim.
   * - Spawn a deployment, which will deploy the shim.
   * - Restoring the state to what it was before.
   * - Connect to IoT over websockets, and Listening for lambda events.
   *
   * @async
   * @returns {Promise<void>} This method is long running, so it does not return a value.
   */
  async dev() {
    const mainProgress = progress.get('main')

    this.serverless.devmodeEnabled = true
    logger.logoDevMode()

    // Educate
    logger.blankLine()
    logger.aside(
      `Dev Mode redirects live AWS Lambda events to your local code enabling you to develop faster without the slowness of deploying changes.`,
    )
    logger.blankLine()
    logger.aside(
      `Docs: https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev`,
    )
    logger.blankLine()
    logger.aside(
      `Run "serverless deploy" after a Dev Mode session to restore original code.`,
    )

    mainProgress.notice('Connecting')

    // TODO: This should be applied more selectively
    chokidar
      .watch(this.serverless.config.serviceDir, {
        ignored: /\.serverless/,
        ignoreInitial: true,
      })
      .on('all', async (event, path) => {
        await this.serverless.pluginManager.spawn('dev-build')
      })

    this.validateRegion()

    await this.update()

    this._updateHooks()

    logger.debug(
      `Spawning the deploy command to instrument your AWS Lambda functions with the dev mode shim`,
    )
    await this.serverless.pluginManager.spawn('deploy')

    this.logOutputs()

    // After the initial deployment we should run one dev-build lifecycle
    // to ensure function code is built if a build plugin is being utilized
    logger.debug(`Spawning the dev-build plugin to build the function code`)
    await this.serverless.pluginManager.spawn('dev-build')

    await this.restore()

    await this.connect()

    await this.watch()
  }

  /**
   * When using devmode we are not actually building deploymentArtifacts and are instead
   * using devmode specific hooks and plugins so we remove all createDeploymentArtifacts
   * hooks when running dev mode
   */
  _updateHooks() {
    for (const hook of this.serverless.pluginManager.hooks[
      'after:package:createDeploymentArtifacts'
    ] || []) {
      if (hook.pluginName === 'AwsDev') {
        continue
      }
      hook.hook = async () => {}
    }

    for (const hook of this.serverless.pluginManager.hooks[
      'before:package:createDeploymentArtifacts'
    ] || []) {
      if (hook.pluginName === 'AwsDev') {
        continue
      }
      hook.hook = async () => {}
    }
  }

  /**
   * Build, bundle and package the dev mode shim responsible for routing events to the local machine..
   *
   * The method performs the following operations:
   * - Generates the path for the zip file based on the service's name and directory.
   * - Bundles and minifies the "shim.js" file using esbuild.
   * - Creates a zip file and writes the bundled "shim.js" contents to it as "index.js".
   * - Sets the modification date of "index.js" to Unix epoch to ensure consistent
   *   zip file hashing for identical contents.
   * - Set the shim package as the deployment artifact for the service, essentially overwriting the original service package.
   *
   * If errors occur during the bundling or zipping process, the method throws a
   * ServerlessError with appropriate messaging to indicate the failure reason.
   *
   * @async
   * @returns {Promise<string>} A promise that resolves with the path to the created
   * zip file upon successful completion of the packaging process.
   * @throws {ServerlessError} Throws an error if bundling the "shim.js" file or
   * creating the zip file fails, with a specific error code for easier debugging.
   */
  async pack() {
    // Save the shim package in .serverless just like the service package
    const zipFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      `${this.serverless.service.service}.zip`,
    )

    logger.debug(`Packing shim file into ${zipFilePath}`)

    let shimFileContents
    try {
      /**
       * The shim.min.js file is built when the binary is built
       */
      shimFileContents = await fs.promises.readFile(
        path.join(__dirname, 'shim.min.js'),
      )
    } catch (e) {
      console.error(e)
      throw new ServerlessError(
        'Failed to build dev mode shim',
        'BUILD_SHIM_FAILED',
        { stack: false },
      )
    }

    try {
      const zip = archiver.create('zip')

      // Create the directory structure if it doesn't exist
      fs.mkdirSync(path.dirname(zipFilePath), { recursive: true })
      const output = fs.createWriteStream(zipFilePath)

      return new Promise(async (resolve, reject) => {
        output.on('close', () => {
          return resolve(zipFilePath)
        })

        output.on('error', (err) => {
          logger.debug('Output file error')
          return reject(err)
        })

        zip.on('error', (err) => {
          logger.debug('Zipper error')
          return reject(err)
        })

        output.on('open', async () => {
          zip.pipe(output)

          // Add the bundled shim file contents to the zip file
          zip.append(shimFileContents, {
            name: 'index.js', // This is the name expected by the handler. If you change this, you must change the handlers config below.
            date: new Date(0), // necessary to get the same hash when zipping the same content
          })

          logger.debug('Finalizing zip file')

          await zip.finalize()
          this.serverless.service.package.artifact = zipFilePath

          this.serverless.service.getAllFunctions().forEach((functionName) => {
            const functionConfig =
              this.serverless.service.getFunction(functionName)
            functionConfig.package = {
              artifact: zipFilePath,
            }
          })
        })
      })
    } catch (e) {
      logger.error(e)
      throw new ServerlessError(
        'Failed to zip dev mode shim',
        'ZIP_SHIM_FAILED',
      )
    }
  }

  /**
   * Updates the serverless service configuration with dev mode config needed for the shim to work. Specifically:
   *   1. Update all AWS Lambda functions' IAM roles to allow all IoT actions.
   *   2. Update all AWS Lambad function's handler to 'index.handler' as set in the shim
   *   3. Update all AWS Lambda functions' runtime to 'nodejs20.x' as expected by the shim
   *   4. Update all AWS Lambda functions' environment variables to include the IoT endpoint and a function identifier.
   *
   * This method also backs up the original IAM configuration and function configurations to allow for later restoration.
   *
   * @returns {Promise<void>} A promise that resolves once all configurations have been updated.
   * @throws {Error} Throws an error if retrieving the IoT endpoint fails.
   */
  async update() {
    logger.debug('Updating service configuration for dev mode')
    // Makes sure we don't mutate the original IAM configuration
    this.originalIamConfig = _.cloneDeep(this.serverless.service.provider.iam)

    // Makes sure we support the old iam role statements syntax
    const oldIamRoleStatements = _.get(
      this.serverless.service.provider,
      'iamRoleStatements',
      [],
    )

    // Makes sure we support the new iam role statements syntax
    const newIamRoleStatements = _.get(
      this.serverless.service.provider,
      'iam.role.statements',
      [],
    )

    // Makes sure we don't overwrite existing IAM configurations
    const iamRoleStatements = [...oldIamRoleStatements, ...newIamRoleStatements]

    iamRoleStatements.push({
      Effect: 'Allow',
      Action: ['iot:*'],
      Resource: '*',
    })

    _.set(
      this.serverless.service.provider,
      'iam.role.statements',
      iamRoleStatements,
    )

    // The IoT endpoint is fetched and passed to the lambda function as env var to be used by the shim
    const iotEndpoint = await this.getIotEndpoint()
    const serviceName = this.serverless.service.getServiceName()
    const stageName = this.serverless.getProvider('aws').getStage()
    const localRuntimeVersion = process.version.split('.')[0].replace('v', '')
    const localRuntime = `nodejs${localRuntimeVersion}.x`
    let atLeastOneRuntimeVersionMismatch = false

    const allFunctions = this.serverless.service.getAllFunctions()

    const notNodeFunction = allFunctions.find((functionName) => {
      const functionConfig = this.serverless.service.getFunction(functionName)

      const functionRuntime =
        functionConfig.runtime ||
        this.serverless.service.provider.runtime ||
        'nodejs20.x'

      return !functionRuntime.startsWith('nodejs')
    })

    if (notNodeFunction) {
      const notNodeRuntime =
        this.serverless.service.getFunction(notNodeFunction).runtime ||
        this.serverless.service.provider.runtime

      throw new ServerlessError(
        `Dev mode does not yet support the "${notNodeRuntime}" runtime. It currently only supports JavaScript and TypeScript on the Node.js runtime. Please refer to the documentation for more information: https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev`,
        'DEV_MODE_UNSUPPORTED_RUNTIME',
        { stack: false },
      )
    }

    const nodeFunctions = allFunctions.filter((functionName) => {
      const functionConfig = this.serverless.service.getFunction(functionName)

      const functionRuntime =
        functionConfig.runtime ||
        this.serverless.service.provider.runtime ||
        'nodejs20.x'

      if (functionRuntime.startsWith('nodejs')) {
        if (localRuntime !== functionRuntime) {
          atLeastOneRuntimeVersionMismatch = true
        }

        return true
      }

      return false
    })

    // Warn the user if the local runtime version does not match event one function runtime version
    if (atLeastOneRuntimeVersionMismatch) {
      logger.warning(
        `Your local machine is using Node.js v${localRuntimeVersion}, while at least one of your functions is not. Ensure matching runtime versions for accurate testing.`,
      )
    }

    // Update all node functions in the service to use the shim
    nodeFunctions.forEach((functionName) => {
      const functionConfig = this.serverless.service.getFunction(functionName)

      this.originalFunctionConfigs[functionName] = _.cloneDeep(functionConfig)

      // For build plugins we need to make the original handler path available in the functionConfig
      functionConfig.originalHandler = functionConfig.handler

      functionConfig.handler = 'index.handler'
      functionConfig.runtime = 'nodejs20.x'

      functionConfig.environment = functionConfig.environment || {}

      // We need to set the function identifier so the shim knows which function was invoked
      functionConfig.environment.SLS_IOT_ENDPOINT = iotEndpoint
      functionConfig.environment.SLS_SERVICE = serviceName
      functionConfig.environment.SLS_STAGE = stageName
      functionConfig.environment.SLS_FUNCTION = functionName

      // Make sure dev mode also supports the "serverless-iam-roles-per-function" plugin:
      // https://github.com/functionalone/serverless-iam-roles-per-function
      // Issue Ref: https://github.com/serverless/serverless/issues/12619
      if (
        functionConfig.iamRoleStatements &&
        Array.isArray(functionConfig.iamRoleStatements)
      ) {
        const functionIamRoleStatements = functionConfig.iamRoleStatements

        functionIamRoleStatements.push({
          Effect: 'Allow',
          Action: ['iot:*'],
          Resource: '*',
        })
      }
    })

    // Disable observability if it's enabled
    if (
      isDashboardObservabilityEnabled(
        this.serverless.configurationInput,
        this.serverless.getProvider('aws').getStage(),
      )
    ) {
      this.serverless.configurationInput.stages =
        this.serverless.configurationInput.stages || {}

      this.serverless.configurationInput.stages[stageName] = {
        observability: false,
      }
    }
  }

  /**
   * Restores the serverless service configuration to its original state. Specifically:
   *   1. Resets the IAM configuration.
   *   2. Resets all function configurations to their original handler, runtime, and environment variables.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves once all configurations have been successfully restored.
   */
  async restore() {
    logger.debug(
      'Restoring service configuration to its original state in memory',
    )
    this.serverless.service.provider.iam = this.originalIamConfig

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionConfig = this.serverless.service.getFunction(functionName)

      const originalFunctionConfig = this.originalFunctionConfigs[functionName]

      // If the function was not updated, we don't need to restore it
      if (!originalFunctionConfig) {
        return
      }

      const { handler, runtime, environment } = originalFunctionConfig

      functionConfig.handler = handler
      functionConfig.environment = environment
      functionConfig.runtime = this.provider.getRuntime(runtime)
    })
  }

  /**
   * Fetches the IoT endpoint address from the AWS SDK.
   * It is a single unique endpoint across all regions in an AWS account.
   * It is available in the account by default without having to deploy any infra.
   * Both the shim and the CLI use that endpoint to connect to each other.
   *
   * @returns {Promise<string>} A promise that resolves with the IoT endpoint address.
   */
  async getIotEndpoint() {
    const res = await this.provider.request('Iot', 'describeEndpoint', {
      endpointType: 'iot:Data-ATS',
    })

    return res.endpointAddress
  }

  /**
   * Given a topic name, constructs the full topic identifier for the IoT endpoint.
   * The topic identifier is used to subscribe to the IoT endpoint and listen for incoming events.
   * The topic identifier is constructed as "sls/region/serviceName/stageName/functionName".
   * @param {string} topicName
   * @returns {string} topicId - The full topic identifier for the IoT endpoint.
   */
  getTopicId(topicName) {
    const region = this.serverless.getProvider('aws').getRegion()
    const stage = this.serverless.getProvider('aws').getStage()
    const serviceName = this.serverless.service.getServiceName()

    let topicId = `sls/${region}/${serviceName}/${stage}`

    if (topicName) {
      topicId += `/${topicName}`
    }

    return topicId
  }

  /**
   * Parses the dev mode function identifier into an object containing its constituent components.
   *
   * The development mode function identifier is expected to be a string formatted as follows:
   * "sls/regionName/serviceName/stageName/functionName". This method splits the identifier by '/'
   * and extracts the region name, service name, stage name, and function name.
   *
   *
   * @param {string} devModeFunctionId - The development mode function identifier to be parsed.
   * @returns {Object} An object containing the extracted region name, service name, stage name,
   * and function name from the development mode function identifier.
   */
  parseTopicId(topicId) {
    const [_, regionName, serviceName, stageName, functionName] =
      topicId.split('/')

    return {
      regionName,
      serviceName,
      stageName,
      functionName,
    }
  }

  /**
   * Connects to the IoT endpoint over websockets and listens for lambda events.
   * The method subscribes to all function invocation topics and listens for incoming events.
   * When an event is received, the method invokes the corresponding function locally, waits for the result,
   * and publishes the result back to the IoT endpoint for the lambda function to use as a response to the invocation.
   *
   * @returns {Promise<void>} This is a long-running method, so it does not return a value.
   */
  async connect() {
    const mainProgress = progress.get('main')
    logger.debug('Connecting to IoT endpoint')

    const endpoint = await this.getIotEndpoint()

    const {
      accessKeyId,
      secretAccessKey: secretKey,
      sessionToken,
    } = await this.provider.getCredentials()

    const device = new iot.device({
      protocol: 'wss',
      host: endpoint,
      accessKeyId,
      secretKey,
      sessionToken,
      autoResubscribe: true,
      offlineQueueing: true,
      baseReconnectTimeMs: 1000,
      maximumReconnectTimeMs: 1000,
      minimumConnectionTimeMs: 1000,
      keepalive: 1,
    })

    device.on('error', (e) => {
      logger.debug('IoT connection error', e)
    })

    device.on('offline', (e) => {
      mainProgress.notice('Reconnecting')
    })

    device.on('connect', (e) => {
      if (!this.heartbeatInterval) {
        this.heartbeatInterval = setInterval(() => {
          device.publish(
            this.getTopicId('_heartbeat'),
            JSON.stringify({ connected: true }),
            {
              qos: 1,
            },
          )
        }, 1000)
      }

      logger.success(`Connected (Ctrl+C to cancel)`)
      mainProgress.remove()
    })

    // Each function has a seperate topic we need to subscribe to
    const functionNames = this.serverless.service.getAllFunctions()

    for (const functionName of functionNames) {
      device.subscribe(this.getTopicId(`${functionName}/request`), {
        qos: 1,
      })
    }

    /**
     * We listen for messages on the function's invocation topic.
     * Messages include the event, environment, and context for the function invocation.
     */
    device.on('message', async (topic, buffer) => {
      /**
       * parse the topicId to get the function name as set in the yaml file
       * so we can get the function configuration
       */
      const { functionName } = this.parseTopicId(topic)

      /**
       * If _heartbeat is set as the function name, this is just
       * the heartbeat message we publish from the local machine
       * to check if the connection is still alive.
       * Just ignore it.
       */
      if (functionName === '_heartbeat') {
        return
      }

      const { event, environment, context } = JSON.parse(buffer.toString())

      const invocationColorFn = stringToSafeColor(context.awsRequestId)

      this.logFunctionEvent(
        functionName,
        event,
        this.options.detailed,
        invocationColorFn,
      )

      const functionConfig = this.serverless.service.getFunction(functionName)
      const runtime = this.provider.getRuntime(functionConfig.runtime)

      // Spawn the Dev Invoke command to build changes with esbuild
      // await this.serverless.pluginManager.spawn('dev-invoke');

      let serviceAbsolutePath = this.serverless.serviceDir

      // If a build plugin was used then we need to set the serviceAbsolutePath to the build directory
      if (
        this.serverless.builtFunctions &&
        this.serverless.builtFunctions.has(functionName)
      ) {
        serviceAbsolutePath = path.join(
          this.serverless.config.serviceDir,
          '.serverless',
          'build',
        )
      }

      /**
       * We create a new instance of the LocalLambda class to invoke the function locally.
       * We need to know what the original runtime of the user function is to run the correct wrapper
       * We also need the handler to know which file to import and which function to call
       * We also set the environment and context to be passed to the function
       */
      const localLambda = new LocalLambda({
        serviceAbsolutePath,
        handler: functionConfig.handler,
        runtime,
        environment,
        invocationColorFn,
      })

      // set the timeout settings to be used by the getRemainingTimeInMillis function
      context.timeout = functionConfig.timeout || 6

      const startTime = performance.now()

      /**
       * Invoke the function locally and pass the event and context.
       * The context passed does not include context functions like .done, .succeed, .fail,
       * because we can't stream them over WebSockets. Those functions will be added by the wrapper later.
       * This function waits until the function execution is complete and returns the response.
       * The response includes any error that the function threw.
       */
      const response = await localLambda.invoke(event, context)

      const endTime = performance.now()

      const timeoutInMs = Math.round(context.timeout * 1000)
      const executionTimeInMs = Math.round(endTime - startTime)

      if (executionTimeInMs > timeoutInMs) {
        log.blankLine()
        log.warning(
          `Local invocation of function "${functionName}" took ${executionTimeInMs}ms, which exceeds the configured timeout of ${timeoutInMs}ms. Consider increasing the timeout, or optimizing your function.`,
        )
        log.blankLine()
      }

      this.logFunctionResponse(
        functionName,
        response.response,
        this.options.detailed,
        invocationColorFn,
      )

      // attach the requestId that corresponds to this response
      response.requestId = context.awsRequestId

      // Publish the result back to the function
      device.publish(
        this.getTopicId(`${functionName}/response`),
        JSON.stringify(response),
        {
          qos: 1,
        },
      )
    })

    /**
     * Exit the process when the user presses Ctrl+C
     */
    process.on('SIGINT', () => {
      mainProgress.remove()
      logger.blankLine()
      logger.blankLine()
      logger.warning(
        `Don't forget to run "serverless deploy" immediately upon closing Dev Mode to restore your original code and remove Dev Mode's instrumentation or your functions will not work!`,
      )
      logger.blankLine()
      process.exit(0)
    })
  }

  async watch() {
    const configFilePath = path.resolve(
      this.serverless.serviceDir,
      this.serverless.configurationFilename,
    )

    chokidar.watch(configFilePath).on('change', (event, path) => {
      logger.warning(
        `If you've made infrastructure changes, restart the dev command w/ "serverless dev"`,
      )
      logger.blankLine()
    })
  }

  /**
   * Validates the region specified in the serverless.yml file or the command line options.
   * Specifically, makes sure the region is supported by AWS IoT Core.
   */
  validateRegion() {
    // Those are the regions where AWS IoT Core is available
    const supportedRegions = [
      'us-east-1',
      'us-east-2',
      'us-west-1',
      'us-west-2',
      'ap-east-1',
      'ap-south-1',
      'ap-southeast-1',
      'ap-southeast-2',
      'ap-northeast-1',
      'ap-northeast-2',
      'ca-central-1',
      'eu-central-1',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
      'eu-north-1',
      'me-south-1',
      'me-central-1',
      'sa-east-1',
    ]

    const regionSpecified =
      this.options.region || this.serverless.service.provider.region

    if (regionSpecified && !supportedRegions.includes(regionSpecified)) {
      throw new ServerlessError(
        `The "serverless dev" command does not support the "${regionSpecified}" region. Supported regions are: ${supportedRegions.join(', ')}.`,
        'UNSUPPORTED_REGION',
        { stack: false },
      )
    }
  }

  /**
   * Logs the first 10 functions and endpoints in the serviceOutputs Map.
   */
  logOutputs() {
    /**
     * If this.serverless.serviceOutputs exists property exists,
     * loop through the "endpoints" and "functions" in this.serverless.serviceOutputs Map.
     * List the first 10 in the console.
     */
    try {
      if (this.serverless.serviceOutputs) {
        const functions = this.serverless.serviceOutputs.get('functions')
        if (Array.isArray(functions)) {
          const functionCount = functions.length
          const maxFunctions = 10
          let functionsLog = 'Functions:\n'

          if (functionCount > 0) {
            for (let i = 0; i < Math.min(functionCount, maxFunctions); i++) {
              functionsLog += `  ${functions[i]}\n`
            }

            if (functionCount > maxFunctions) {
              functionsLog += `  ... and ${functionCount - maxFunctions} more\n`
            }
          }

          // Remove line break at the end
          functionsLog = functionsLog.slice(0, -1)

          logger.aside(functionsLog)
        }

        let endpoints = this.serverless.serviceOutputs.get('endpoints')

        // If there is only one endpoint, it is stored as a separate property
        const singleEndpoint = this.serverless.serviceOutputs.get('endpoint')

        endpoints = endpoints || (singleEndpoint ? [singleEndpoint] : null)

        if (Array.isArray(endpoints)) {
          const endpointCount = endpoints.length
          const maxEndpoints = 10
          let endpointsLog = 'Endpoints:\n'

          if (endpointCount > 0) {
            for (let i = 0; i < Math.min(endpointCount, maxEndpoints); i++) {
              endpointsLog += `  ${endpoints[i]}\n`
            }

            if (endpointCount > maxEndpoints) {
              endpointsLog += `  ... and ${endpointCount - maxEndpoints} more\n`
            }
          }

          // Remove line break at the end
          endpointsLog = endpointsLog.slice(0, -1)

          logger.aside(endpointsLog)
        }
      }
    } catch (e) {
      // Fail silently except for debug
      logger.debug(`Failed to log functions and endpoints: ${e.message}`)
    }
  }

  /**
   * Returns the event log line based on the event type.
   * @param {*} event
   * @returns string
   */
  getEventLog(event) {
    let eventLog = ''

    // ApiGateway REST
    if (event.requestContext && event.httpMethod) {
      const method = event.httpMethod.toLowerCase()
      const path = event.path

      eventLog = `── aws:apigateway:v1:${method}:${path}`
    }

    // ApiGateway HTTP
    if (event.requestContext && event.routeKey) {
      const method = event.requestContext.http.method.toLowerCase()
      const path = event.requestContext.http.path

      eventLog = `── aws:apigateway:v2:${method}:${path}`
    }

    // EventBridge
    if (event['detail-type'] !== undefined) {
      const eventSource = event.source
      const detailType = event['detail-type']

      eventLog = `── aws:eventbridge:${eventSource}:${detailType}`
    }

    // S3
    if (
      event.Records &&
      event.Records.length === 1 &&
      event.Records[0].eventSource === 'aws:s3'
    ) {
      const bucketName = event.Records[0].s3.bucket.name
      const eventName = event.Records[0].eventName

      eventLog = `── aws:s3:${bucketName}:${eventName}`
    }

    // SQS
    if (
      event.Records &&
      event.Records.length === 1 &&
      event.Records[0].eventSource === 'aws:sqs'
    ) {
      const queueName = event.Records[0].eventSourceARN.split(':').pop()
      const messageId = event.Records[0].messageId

      eventLog = `── aws:sqs:${queueName}:${messageId}`
    }

    // SNS
    if (
      event.Records &&
      event.Records.length === 1 &&
      event.Records[0].EventSource === 'aws:sns'
    ) {
      const topicName = event.Records[0].Sns.TopicArn.split(':').pop()
      const subject = event.Records[0].Sns.Subject
      const messageId = event.Records[0].Sns.MessageId

      eventLog = `── aws:sqs:${topicName}:${subject || messageId}`
    }

    return eventLog
  }

  /**
   * Logs the function event log line and the event object if verbose is enabled
   *
   * @param {*} functionName
   * @param {*} event
   * @param {*} isVerbose
   * @param {*} invocationColorFn
   */
  logFunctionEvent(functionName, event, isVerbose, invocationColorFn) {
    try {
      const eventLog = this.getEventLog(event)

      logger.aside(`${invocationColorFn('→')} λ ${functionName} ${eventLog}`)

      if (isVerbose) {
        logger.aside(
          `${util.inspect(event, {
            showHidden: true,
            depth: null,
            colors: true,
          })}`,
        )
      }
    } catch (e) {}
  }

  /**
   * Logs the function response log line and the response object if verbose is enabled
   * @param {*} functionName
   * @param {*} response
   * @param {*} isVerbose
   * @param {*} invocationColorFn
   */
  logFunctionResponse(functionName, response, isVerbose, invocationColorFn) {
    try {
      let responseLog = `${invocationColorFn('←')} λ ${functionName}`

      if (response && response.statusCode) {
        responseLog += ` (${response.statusCode})`
      }

      logger.aside(responseLog)

      if (response && isVerbose) {
        logger.aside(
          `${util.inspect(response, {
            showHidden: true,
            depth: null,
            colors: true,
          })}`,
        )
      }
    } catch (e) {}
  }
}

export default AwsDev
