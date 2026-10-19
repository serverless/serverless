import ServerlessError from '../../../serverless-error.js'
import { deployCommand } from '../lib/deploy-command.js'
import { getLogicalId, pascalCase } from '../bedrock-agentcore/utils/naming.js'
import {
  cloudFrontOf,
  endpointOutputs,
  externalHttpApiEndpointOf,
  functionUrlOf,
  webAppUrlsOf,
} from './endpoints.js'
import { serviceHasWebApps } from '../lib/web-apps.js'
import { isStackNotFound } from '../lib/not-found-errors.js'

/**
 * `serverless info` on a stage that was never deployed is the normal state
 * right after a project is created. CloudFormation answers the lookup with
 * "Stack with id <name> does not exist"; say that the service is not deployed
 * there and how to deploy it, in one line without a stack trace. Returns
 * undefined for any other error, which the caller rethrows unchanged.
 *
 * In a Compose project the suggested deploy names this service only (see
 * deployCommand).
 */
const notDeployedError = (plugin, error) => {
  if (!isStackNotFound(error)) return undefined
  const stage = plugin.provider.getStage()
  const region = plugin.provider.getRegion()
  const notDeployed = new ServerlessError(
    `Service "${plugin.serverless.service.service}" is not deployed to stage "${stage}" in ${region}. Deploy it with "${deployCommand(plugin)}".`,
    'STACK_NOT_FOUND',
  )
  notDeployed.stack = undefined
  return notDeployed
}

export default {
  async getStackInfo() {
    // NOTE: this is the global gatheredData object which will be passed around
    this.gatheredData = {
      inputs: {
        compose: this.serverless.compose.serviceParams,
      },
      info: {
        functions: [],
        layers: [],
        agents: [],
        endpoints: [],
        service: this.serverless.service.service,
        stage: this.provider.getStage(),
        region: this.provider.getRegion(),
        stack: this.provider.naming.getStackName(),
      },
      outputs: [],
    }
    // The endpoint URLs that belong to an HTTP API. Display lists their
    // routes differently from a REST API's, and the URLs look alike. Kept off
    // gatheredData, which `info --json` prints as is.
    this.httpApiEndpoints = new Set()

    const stackName = this.provider.naming.getStackName()

    const stackData = {}
    const sdkRequests = [
      this.provider
        .request('CloudFormation', 'describeStacks', { StackName: stackName })
        .then(
          (result) => {
            if (result) stackData.outputs = result.Stacks[0].Outputs
          },
          (error) => {
            throw notDeployedError(this, error) ?? error
          },
        ),
    ]
    if (this.serverless.service.provider.httpApi?.id) {
      sdkRequests.push(
        externalHttpApiEndpointOf({
          provider: this.provider,
          service: this.serverless.service,
        }).then(
          (endpoint) => {
            stackData.externalHttpApiEndpoint = endpoint
          },
          (error) => {
            throw new ServerlessError(
              `Could not resolve provider.httpApi.id parameter. ${error.message}`,
              'UNABLE_TO_RESOLVE_HTTP_API_ID',
            )
          },
        ),
      )
    }

    // Get info from CloudFormation Outputs
    return Promise.all(sdkRequests).then(async () => {
      let outputs

      if (stackData.outputs) {
        ;({ outputs } = stackData)

        // Outputs
        this.gatheredData.outputs = outputs

        // Functions
        this.serverless.service.getAllFunctions().forEach((func) => {
          const functionObj = this.serverless.service.getFunction(func)
          const functionInfo = {}
          functionInfo.name = func
          functionInfo.deployedName = functionObj.name
          functionInfo.artifactSize = functionObj.artifactSize
          const url = functionUrlOf({
            outputs,
            naming: this.provider.naming,
            functionName: func,
          })
          if (url) functionInfo.url = url
          this.gatheredData.info.functions.push(functionInfo)
        })

        // Web apps: present only in a service that has them, so `info --json` stays as it was
        // for every other service
        if (serviceHasWebApps(this.serverless)) {
          this.gatheredData.info.webApps = webAppUrlsOf({
            serverless: this.serverless,
            outputs,
          })
        }

        // Layers
        this.serverless.service.getAllLayers().forEach((layer) => {
          const layerInfo = {}
          layerInfo.name = layer
          const layerOutputId =
            this.provider.naming.getLambdaLayerOutputLogicalId(layer)
          for (const output of outputs) {
            if (output.OutputKey === layerOutputId) {
              layerInfo.arn = output.OutputValue
              break
            }
          }
          this.gatheredData.info.layers.push(layerInfo)
        })

        // Agents (Bedrock AgentCore)
        const agents = this.serverless.service.ai?.agents || {}
        for (const [agentName, agentConfig] of Object.entries(agents)) {
          const agentInfo = { name: agentName }
          const agentType = agentConfig.type || 'runtime'

          // Generate the logical ID using the same function as bedrock-agentcore plugin
          const typeCapitalized =
            agentType.charAt(0).toUpperCase() + agentType.slice(1)
          const logicalId = getLogicalId(agentName, typeCapitalized)

          // Look for URL output (for runtime agents)
          const urlOutput = outputs.find(
            (o) => o.OutputKey === `${logicalId}Url`,
          )
          if (urlOutput) {
            agentInfo.url = urlOutput.OutputValue
          } else {
            // Fallback to ARN if no URL
            const arnOutput = outputs.find(
              (o) => o.OutputKey === `${logicalId}Arn`,
            )
            if (arnOutput) {
              agentInfo.arn = arnOutput.OutputValue
            }
          }

          agentInfo.type = agentType
          this.gatheredData.info.agents.push(agentInfo)
        }

        // Gateways (Bedrock AgentCore) — shown inside agents section
        const agentGateways = this.serverless.service.ai?.gateways || {}
        for (const [gatewayName] of Object.entries(agentGateways)) {
          const logicalId = `AgentCoreGateway${pascalCase(gatewayName)}`
          const gatewayInfo = { name: gatewayName }

          const urlOutput = outputs.find(
            (o) => o.OutputKey === `${logicalId}Url`,
          )
          if (urlOutput) {
            gatewayInfo.url = urlOutput.OutputValue
          }

          this.gatheredData.info.agents.push(gatewayInfo)
        }

        // CloudFront
        const cloudFront = cloudFrontOf({
          outputs,
          naming: this.provider.naming,
        })
        if (cloudFront) this.gatheredData.info.cloudFront = cloudFront

        // Endpoints
        const { endpoints, httpApiEndpoints } = endpointOutputs({
          outputs,
          naming: this.provider.naming,
        })
        for (const endpoint of endpoints) {
          this.gatheredData.info.endpoints.push(endpoint)
          if (httpApiEndpoints.has(endpoint)) {
            this.httpApiEndpoints.add(endpoint)
          }
          if (
            this.serverless.service.deployment &&
            this.serverless.service.deployment.deploymentId
          ) {
            this.serverless.service.deployment.apiId = endpoint
              .split('//')[1]
              .split('.')[0]
          }
        }
      }
      if (stackData.externalHttpApiEndpoint) {
        this.gatheredData.info.endpoints.push(stackData.externalHttpApiEndpoint)
        this.httpApiEndpoints.add(stackData.externalHttpApiEndpoint)
      }

      return Promise.resolve()
    })
  },
}
