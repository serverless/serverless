import writeServiceOutputs from '../../../cli/write-service-outputs.js'
import validate from '../lib/validate.js'
import getStackInfo from './get-stack-info.js'
import getResourceCount from './get-resource-count.js'
import getApiKeyValues from './get-api-key-values.js'
import display from './display.js'
import utils from '@serverlessinc/sf-core/src/utils.js'
const { writeText } = utils

class AwsInfo {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.logger = pluginUtils.log
    this.loggerStyle = pluginUtils.style
    this.progress = pluginUtils.progress
    this.provider = this.serverless.getProvider('aws')
    this.options = options || {}
    Object.assign(
      this,
      validate,
      getStackInfo,
      getResourceCount,
      getApiKeyValues,
      display,
    )

    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          info: {
            lifecycleEvents: [
              'validate',
              'gatherData',
              'displayServiceInfo',
              'displayApiKeys',
              'displayEndpoints',
              'displayFunctions',
              'displayLayers',
              'displayStackOutputs',
            ],
          },
        },
      },
    }

    this.hooks = {
      'info:info': async () => this.serverless.pluginManager.spawn('aws:info'),
      'deploy:deploy': async () =>
        this.serverless.pluginManager.spawn('aws:info'),
      'before:aws:info:validate': () => {
        this.progress.notice('Fetching Service Information')
        const isDeployCommand =
          this.serverless.processedInput.commands.join(' ') === 'deploy'
        if (!isDeployCommand) return
      },
      'aws:info:validate': async () => this.validate(),
      'aws:info:gatherData': async () => {
        await this.getStackInfo()
        await this.getResourceCount()
        await this.getApiKeyValues()
      },
      'aws:info:displayServiceInfo': async () => this.displayServiceInfo(),
      'aws:info:displayApiKeys': async () => this.displayApiKeys(),
      'aws:info:displayEndpoints': async () => this.displayEndpoints(),
      'aws:info:displayFunctions': async () => this.displayFunctions(),
      'aws:info:displayLayers': async () => this.displayLayers(),
      'aws:info:displayStackOutputs': async () => this.displayStackOutputs(),
      'after:aws:info:gatherData': () => {
        if (this.gatheredData && this.gatheredData.info.resourceCount >= 450) {
          this.logger.warning(
            `You have ${
              this.gatheredData.info.resourceCount
            } resources in your service. CloudFormation has a hard limit of 500 resources in a service. For advice on avoiding this limit, check out this link: ${this.loggerStyle.link(
              'http://slss.io/2q2',
            )}.`,
          )
        }
      },
      finalize: () => {
        this.progress.remove()
        if (this.serverless.processedInput.commands.join(' ') !== 'info') return
        if (options?.json) {
          writeText(
            JSON.stringify(
              { ...this.gatheredData, ...this.serverless.servicePluginOutputs },
              null,
              2,
            ),
          )
          return
        }
        writeServiceOutputs(
          this.serverless.serviceOutputs,
          this.gatheredData,
          this.options,
        )
        writeServiceOutputs(
          this.serverless.servicePluginOutputs,
          this.gatheredData,
          this.options,
        )
      },
    }
  }
}

export default AwsInfo
