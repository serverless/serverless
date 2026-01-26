import resolveCfImportValue from '../utils/resolve-cf-import-value.js'
import ServerlessError from '../../../serverless-error.js'
import { getLogicalId } from '../bedrock-agentcore/utils/naming.js'

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

    const stackName = this.provider.naming.getStackName()

    const stackData = {}
    const sdkRequests = [
      this.provider
        .request('CloudFormation', 'describeStacks', { StackName: stackName })
        .then((result) => {
          if (result) stackData.outputs = result.Stacks[0].Outputs
        }),
    ]
    const httpApiId =
      this.serverless.service.provider.httpApi &&
      this.serverless.service.provider.httpApi.id
    if (httpApiId) {
      sdkRequests.push(
        (httpApiId['Fn::ImportValue']
          ? resolveCfImportValue(this.provider, httpApiId['Fn::ImportValue'])
          : Promise.resolve(httpApiId)
        )
          .then((id) => {
            return this.provider.request('ApiGatewayV2', 'getApi', {
              ApiId: id,
            })
          })
          .then(
            (result) => {
              stackData.externalHttpApiEndpoint = result.ApiEndpoint
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

        const serviceEndpointOutputRegex =
          this.provider.naming.getServiceEndpointRegex()

        // Outputs
        this.gatheredData.outputs = outputs

        // Functions
        this.serverless.service.getAllFunctions().forEach((func) => {
          const functionObj = this.serverless.service.getFunction(func)
          const functionInfo = {}
          functionInfo.name = func
          functionInfo.deployedName = functionObj.name
          functionInfo.artifactSize = functionObj.artifactSize
          const functionUrlOutput = outputs.find(
            (output) =>
              output.OutputKey ===
              this.provider.naming.getLambdaFunctionUrlOutputLogicalId(func),
          )
          if (functionUrlOutput) {
            functionInfo.url = functionUrlOutput.OutputValue
          }
          this.gatheredData.info.functions.push(functionInfo)
        })

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
        const agents = this.serverless.service.agents || {}
        const RESERVED_AGENT_KEYS = ['memories', 'tools']
        for (const [agentName, agentConfig] of Object.entries(agents)) {
          // Skip reserved configuration keys
          if (RESERVED_AGENT_KEYS.includes(agentName)) {
            continue
          }

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

        // CloudFront
        const cloudFrontDomainName = outputs.find(
          (output) =>
            output.OutputKey ===
            this.provider.naming.getCloudFrontDistributionDomainNameLogicalId(),
        )
        if (cloudFrontDomainName) {
          this.gatheredData.info.cloudFront = cloudFrontDomainName.OutputValue
        }

        // Endpoints
        outputs
          .filter((x) => x.OutputKey.match(serviceEndpointOutputRegex))
          .forEach((x) => {
            if (x.OutputKey === 'HttpApiUrl') {
              this.gatheredData.info.endpoints.push(`httpApi: ${x.OutputValue}`)
            } else {
              this.gatheredData.info.endpoints.push(x.OutputValue)
            }
            if (
              this.serverless.service.deployment &&
              this.serverless.service.deployment.deploymentId
            ) {
              this.serverless.service.deployment.apiId =
                x.OutputValue.split('//')[1].split('.')[0]
            }
          })
      }
      if (stackData.externalHttpApiEndpoint) {
        this.gatheredData.info.endpoints.push(
          `httpApi: ${stackData.externalHttpApiEndpoint}`,
        )
      }

      return Promise.resolve()
    })
  },
}
