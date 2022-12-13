'use strict';

module.exports = class TestPlugin {
  constructor(serverless, options, utils) {
    this.serverless = serverless;
    this.options = options;
    this.utils = utils;

    this.hooks = {
      initialize: () => this.extendAfterInit(),
    };
  }

  async asyncInit() {
    const configExt = {
      var: 'value',
    };
    this.serverless.extendConfiguration(['custom', 'extend', 'value'], configExt);
    this.serverless.extendConfiguration(['custom', 'extend', 'preexist'], configExt);
    this.serverless.extendConfiguration(['custom', 'extend', 'ref'], '${self:custom.extend.value}');

    try {
      this.serverless.extendConfiguration([], { custom: {} });
    } catch (error) {
      // ignore this
    }
  }

  extendAfterInit() {
    try {
      this.serverless.extendConfiguration(['custom', 'extend', 'afterInit'], 'value');
    } catch (error) {
      // ignore this
    }
  }
};
