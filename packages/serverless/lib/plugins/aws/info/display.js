import filesize from '../../../utils/filesize.js'
import { style } from '@serverless/util'
import { formatEndpoints } from './endpoints.js'

export default {
  async displayServiceInfo() {
    if (this.serverless.processedInput.commands.join(' ') === 'info') {
      this.serverless.serviceOutputs.set(
        'service',
        this.serverless.service.service,
      )
      this.serverless.serviceOutputs.set('stage', this.provider.getStage())
      this.serverless.serviceOutputs.set('region', this.provider.getRegion())
      this.serverless.serviceOutputs.set(
        'stack',
        this.provider.naming.getStackName(),
      )
    }
  },

  displayApiKeys() {
    const conceal = this.options.conceal
    const info = this.gatheredData.info

    if (info.apiKeys && info.apiKeys.length > 0) {
      const outputSectionItems = []
      info.apiKeys.forEach((apiKeyInfo) => {
        const description = apiKeyInfo.description
          ? ` - ${apiKeyInfo.description}`
          : ''
        if (conceal) {
          outputSectionItems.push(`${apiKeyInfo.name}${description}`)
        } else {
          outputSectionItems.push(
            `${apiKeyInfo.name}: ${apiKeyInfo.value}${description}`,
          )
        }
      })
      this.serverless.serviceOutputs.set('api keys', outputSectionItems)
    }
  },

  displayEndpoints() {
    const info = this.gatheredData.info
    const outputSectionItems = formatEndpoints({
      serverless: this.serverless,
      endpoints: info.endpoints,
      httpApiEndpoints: this.httpApiEndpoints,
      cloudFront: info.cloudFront,
      functionUrls: info.functions.filter((fn) => fn.url),
      webApps: info.webApps,
    })

    if (outputSectionItems.length > 1) {
      this.serverless.serviceOutputs.set('endpoints', outputSectionItems)
    } else if (outputSectionItems.length) {
      this.serverless.serviceOutputs.set('endpoint', outputSectionItems[0])
    }
  },

  displayFunctions() {
    const info = this.gatheredData.info

    if (info.functions && info.functions.length > 0) {
      const outputSectionItems = []
      info.functions.forEach((f) => {
        outputSectionItems.push(
          `${f.name}: ${f.deployedName}${
            f.artifactSize ? style.aside(` (${filesize(f.artifactSize)})`) : ''
          }`,
        )
      })
      this.serverless.serviceOutputs.set('functions', outputSectionItems)
    }
  },

  displayLayers() {
    const info = this.gatheredData.info

    if (info.layers && info.layers.length > 0) {
      const outputSectionItems = []
      info.layers.forEach((l) => {
        outputSectionItems.push(`${l.name}: ${l.arn}`)
      })
      this.serverless.serviceOutputs.set('layers', outputSectionItems)
    }
  },

  displayAgents() {
    const info = this.gatheredData.info

    if (info.agents && info.agents.length > 0) {
      const outputSectionItems = []
      info.agents.forEach((agent) => {
        // Display URL if available, otherwise ARN
        const value = agent.url || agent.arn || 'N/A'
        outputSectionItems.push(`${agent.name}: ${value}`)
      })
      this.serverless.serviceOutputs.set('agents', outputSectionItems)
    }
  },

  displayStackOutputs() {
    this.serverless.stackOutputs = Object.fromEntries(
      this.gatheredData.outputs.map(({ OutputKey, OutputValue }) => [
        OutputKey,
        OutputValue,
      ]),
    )

    if (this.options.verbose && this.gatheredData.outputs.length) {
      const outputSectionItems = []
      this.gatheredData.outputs.forEach((output) => {
        outputSectionItems.push(`${output.OutputKey}: ${output.OutputValue}`)
      })

      this.serverless.serviceOutputs.set('Stack Outputs', outputSectionItems)
    }
  },
}
