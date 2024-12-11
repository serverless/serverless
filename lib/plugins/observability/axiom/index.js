import {
  getLambdaConfigs,
  subscribeLogGroups,
  validateAndGetToken,
  unsubscribeLogGroups,
  initialize,
} from '@serverlessinc/sf-core/src/lib/observability/axiom/index.js'
import { Architecture } from '@aws-sdk/client-lambda'
import ServerlessError from '@serverlessinc/sf-core/src/utils/errors/serverlessError.js'
import monitorStack from '../../aws/lib/monitor-stack.js'
import { determineObservabilityProviderFromConfig } from '../index.js'
import { ObservabilityProvider } from '@serverlessinc/sf-core/src/lib/observability/index.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { progress } = utils

const mainProgress = progress.get('main')

class Axiom {
  constructor(serverless, options) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')
    this.options = options
    this.hooks = {}
    if (
      determineObservabilityProviderFromConfig(
        this.serverless.configurationInput,
        this.provider.getStage(),
      ) === ObservabilityProvider.AXIOM
    ) {
      Object.assign(this.hooks, {
        'after:package:compileFunctions': this.addEnvVarsAndLayer.bind(this),
        'after:deploy:deploy': this.subscribeLogGroups.bind(this),
        'before:deploy:function:deploy':
          this.addEnvVarsAndLayerToFunction.bind(this),
      })
    } else {
      Object.assign(this.hooks, {
        'after:deploy:deploy': this.unsubscribeLogGroups.bind(this),
      })
    }
    this.axiomToken = null
    Object.assign(this, monitorStack)
  }

  async addEnvVarsAndLayer() {
    const { axiomToken } = await validateAndGetToken({
      dashboardAccessToken: this.serverless.accessKey,
      awsAccountId: await this.provider.getAccountId(),
      orgId: this.serverless.orgId,
      stage: this.provider.getStage(),
      service: this.serverless.configurationInput.service,
      lambdaFunctions: this.getLambdaFunctions(),
    })

    this.axiomToken = axiomToken

    const { lambdaConfigs } = await getLambdaConfigs({
      axiomToken: this.axiomToken,
      region: this.provider.getRegion(),
      prefix: this.getPrefix(),
      datasetName: this.getDatasetName(),
      lambdaFunctions: this.getLambdaFunctions(),
    })

    lambdaConfigs.forEach((lambdaConfig) => {
      const logicalId = this.provider.naming.getLambdaLogicalId(
        lambdaConfig.name,
      )

      const lambdaResource =
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[logicalId]

      if (!lambdaResource) {
        throw new ServerlessError(
          `Lambda function ${lambdaConfig.name} not found in compiled CloudFormation template`,
          'LAMBDA_NOT_FOUND',
        )
      }

      // Check if the function already has 5 layers (Lambda limit)
      if (
        lambdaResource.Properties.Layers &&
        lambdaResource.Properties.Layers.length >= 5
      ) {
        throw new ServerlessError(
          `Lambda function ${lambdaConfig.name} already has the maximum number of layers (5)`,
          'MAX_LAYERS_EXCEEDED',
        )
      }

      // Add the Axiom layer
      if (!lambdaResource.Properties.Layers) {
        lambdaResource.Properties.Layers = []
      }
      if (!lambdaResource.Properties.Layers.includes(lambdaConfig.layerArn)) {
        lambdaResource.Properties.Layers.push(lambdaConfig.layerArn)
      }

      // Add environment variables
      if (!lambdaResource.Properties.Environment) {
        lambdaResource.Properties.Environment = { Variables: {} }
      }
      lambdaResource.Properties.Environment.Variables['AXIOM_TOKEN'] =
        lambdaConfig.environment.AXIOM_TOKEN
      lambdaResource.Properties.Environment.Variables['AXIOM_DATASET'] =
        lambdaConfig.environment.AXIOM_DATASET
    })
  }

  async addEnvVarsAndLayerToFunction() {
    const lambdaFunctions = this.getLambdaFunctions(this.options.function)
    const { axiomToken } = await validateAndGetToken({
      dashboardAccessToken: this.serverless.accessKey,
      awsAccountId: await this.provider.getAccountId(),
      orgId: this.serverless.orgId,
      stage: this.provider.getStage(),
      service: this.serverless.configurationInput.service,
      lambdaFunctions,
    })

    this.axiomToken = axiomToken

    const { lambdaConfigs } = await getLambdaConfigs({
      axiomToken: this.axiomToken,
      region: this.provider.getRegion(),
      prefix: this.getPrefix(),
      datasetName: this.getDatasetName(),
      lambdaFunctions,
    })

    lambdaConfigs.forEach((lambdaConfig) => {
      const functionObj = this.serverless.service.getFunction(lambdaConfig.name)

      // Add the Axiom layer
      if (!functionObj.layers) {
        functionObj.layers = []
      }
      if (!functionObj.layers.includes(lambdaConfig.layerArn)) {
        functionObj.layers.push(lambdaConfig.layerArn)
      }

      // Add environment variables
      if (!functionObj.environment) {
        functionObj.environment = {}
      }
      functionObj.environment['AXIOM_TOKEN'] =
        lambdaConfig.environment.AXIOM_TOKEN
      functionObj.environment['AXIOM_DATASET'] =
        lambdaConfig.environment.AXIOM_DATASET
    })
  }

  async subscribeLogGroups() {
    if (this.serverless.service.provider.shouldNotDeploy) {
      return
    }
    mainProgress.notice('Integrating with Axiom')

    if (!this.axiomToken) {
      const { axiomToken } = await validateAndGetToken({
        dashboardAccessToken: this.serverless.accessKey,
        awsAccountId: await this.provider.getAccountId(),
        orgId: this.serverless.orgId,
        stage: this.provider.getStage(),
        service: this.serverless.configurationInput.service,
        lambdaFunctions: this.getLambdaFunctions(),
      })
      this.axiomToken = axiomToken
    }

    let initializeResult = await initialize({
      axiomToken: this.axiomToken,
      awsCredentials: await this.provider.getCredentials(),
      prefix: this.getPrefix(),
      region: this.provider.getRegion(),
      datasetName: this.getDatasetName(),
    })

    // Set Axiom integration on the serverless object
    this.serverless.integrations[ObservabilityProvider.AXIOM] = initializeResult
      .dataset.created
      ? {
          dataset: {
            name: initializeResult.dataset.dataset.name,
            id: initializeResult.dataset.dataset.id,
            created: initializeResult.dataset.dataset.created,
          },
        }
      : {}

    if (initializeResult.forwarder.stackId) {
      await this.monitorStack(initializeResult.forwarder.action, {
        StackId: initializeResult.forwarder.stackId,
      })
    }

    let subscribeResult = await subscribeLogGroups({
      axiomToken: this.axiomToken,
      awsCredentials: await this.provider.getCredentials(),
      region: this.provider.getRegion(),
      datasetName: this.getDatasetName(),
      prefix: this.getPrefix(),
      lambdaFunctions: this.getLambdaFunctions(),
      resourcesLogGroupNames: this.getResourcesLogGroupNames(),
    })

    if (subscribeResult?.subscriber?.stackId) {
      await this.monitorStack(subscribeResult.subscriber.action, {
        StackId: subscribeResult.subscriber.stackId,
      })
    }
  }

  async unsubscribeLogGroups() {
    const unsubscribeResult = await unsubscribeLogGroups({
      awsCredentials: await this.provider.getCredentials(),
      region: this.provider.getRegion(),
      prefix: this.getPrefix(),
      datasetName: this.getDatasetName(),
      lambdaFunctions: this.getLambdaFunctions(),
      resourcesLogGroupNames: this.getResourcesLogGroupNames(),
    })
    if (unsubscribeResult?.unsubscriber?.stackId) {
      mainProgress.notice('Removing Axiom integration')
      await this.monitorStack(unsubscribeResult.unsubscriber.action, {
        StackId: unsubscribeResult.unsubscriber.stackId,
      })
    }
  }

  getPrefix() {
    return ['prod', 'production'].includes(
      this.provider.getStage().toLowerCase(),
    )
      ? this.provider.getStage()
      : 'default'
  }

  getDatasetName() {
    return (
      this.serverless.configurationInput?.stages?.[this.provider.getStage()]
        ?.observability?.dataset ??
      this.serverless.configurationInput?.stages?.default?.observability
        ?.dataset
    )
  }

  getLambdaFunctions(functionName) {
    return this.serverless.service
      .getAllFunctions()
      .map((configFunctionName) => ({
        configFunctionName,
        functionObject: this.serverless.service.getFunction(configFunctionName),
      }))
      .filter(
        ({ configFunctionName }) =>
          !functionName || configFunctionName.includes(functionName),
      )
      .filter(({ functionObject }) => !functionObject.disableLogs)
      .map(({ configFunctionName, functionObject }) => ({
        name: configFunctionName,
        arch:
          functionObject.architecture ??
          this.serverless.service.provider.architecture ??
          Architecture.x86_64,
        cloudWatchLogGroupName:
          functionObject.logs?.logGroup ??
          this.provider.naming.getLogGroupName(functionObject.name),
      }))
  }

  getResourcesLogGroupNames() {
    return Object.entries(
      this.serverless.service.provider.compiledCloudFormationTemplate
        ?.Resources,
    )
      .filter(
        ([, resourceDetails]) => resourceDetails.Type === 'AWS::Logs::LogGroup',
      )
      .map(([, resourceDetails]) => resourceDetails.Properties.LogGroupName)
  }
}

export default Axiom
