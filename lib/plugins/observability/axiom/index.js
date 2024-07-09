import {
  getLambdaConfigs,
  subscribeLogGroups,
  validateAndGetToken,
  unsubscribeLogGroups,
} from '@serverlessinc/sf-core/src/lib/observability/axiom.js'
import { Architecture } from '@aws-sdk/client-lambda'
import ServerlessError from '@serverlessinc/sf-core/src/utils/errors/serverlessError.js'
import monitorStack from '../../aws/lib/monitor-stack.js'
import { determineObservabilityProviderFromConfig } from '../index.js'
import { ObservabilityProvider } from '@serverlessinc/sf-core/src/lib/observability/index.js'

class Axiom {
  constructor(serverless, options) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')
    this.options = options
    if (
      determineObservabilityProviderFromConfig(
        this.serverless.configurationInput,
        this.provider.getStage(),
      ) === ObservabilityProvider.AXIOM
    ) {
      this.hooks = {
        'after:package:compileFunctions': this.addEnvVarsAndLayer.bind(this),
        'after:deploy:deploy': this.subscribeLogGroups.bind(this),
      }
    } else {
      this.hooks = {
        'after:deploy:deploy': this.unsubscribeLogGroups.bind(this),
      }
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

  async subscribeLogGroups() {
    const {
      ingester: { stackId, action },
    } = await subscribeLogGroups({
      axiomToken: this.axiomToken,
      region: this.provider.getRegion(),
      datasetName: this.getDatasetName(),
      prefix: this.getPrefix(),
      lambdaFunctions: this.getLambdaFunctions(),
      resourcesLogGroupNames: Object.entries(
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources,
      )
        .filter(
          ([, resourceDetails]) =>
            resourceDetails.Type === 'AWS::Logs::LogGroup',
        )
        .map(([, resourceDetails]) => resourceDetails.Properties.LogGroupName),
    })
    if (!stackId) {
      throw new ServerlessError(
        'Axiom ingester stack cannot be found',
        'AXIOM_INGESTER_STACK_NOT_FOUND',
      )
    }
    await this.monitorStack(action, { StackId: stackId })
  }

  async unsubscribeLogGroups() {
    await unsubscribeLogGroups({
      region: this.provider.getRegion(),
      prefix: this.getPrefix(),
      datasetName: this.getDatasetName(),
    })
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

  getLambdaFunctions() {
    return this.serverless.service
      .getAllFunctions()
      .map((configFunctionName) => ({
        configFunctionName,
        functionObject: this.serverless.service.getFunction(configFunctionName),
      }))
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
}

export default Axiom
