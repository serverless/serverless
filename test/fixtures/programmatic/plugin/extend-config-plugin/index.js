'use strict'

const pluginConfig = {
  targetValuePath: ['custom', 'extend', 'value'],
  overwriteValuePath: ['custom', 'extend', 'overwrite'],
  afterInitValuePath: ['custom', 'extend', 'afterInit'],
  refValuePath: ['custom', 'extend', 'ref'],
}

module.exports = class TestPlugin {
  constructor(serverless, options, utils) {
    this.serverless = serverless
    this.options = options
    this.utils = utils

    this.hooks = {
      initialize: () => this.extendAfterInit(),
    }
  }

  async asyncInit() {
    const configExt = {
      var: 'value',
    }
    this.serverless.extendConfiguration(pluginConfig.targetValuePath, configExt)
    this.serverless.extendConfiguration(
      pluginConfig.overwriteValuePath,
      configExt,
    )
    this.serverless.extendConfiguration(
      pluginConfig.refValuePath,
      '${self:custom.extend.value}',
    )

    try {
      this.serverless.extendConfiguration([], { custom: {} })
    } catch (error) {
      // ignore this
    }

    try {
      this.serverless.extendConfiguration('custom.target.invalid', {})
    } catch (error) {
      // ignore this
    }
  }

  extendAfterInit() {
    try {
      this.serverless.extendConfiguration(
        pluginConfig.afterInitValuePath,
        'value',
      )
    } catch (error) {
      // ignore this
    }
  }
}

module.exports.pluginConfig = pluginConfig
