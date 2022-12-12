'use strict';

module.exports = class TestPlugin {
  constructor(serverless, options, utils) {
    this.serverless = serverless;
    this.options = options;
    this.utils = utils;

    this.target = this.serverless.configurationInput.custom.extendConfig.target;
    this.value = this.serverless.configurationInput.custom.extendConfig.value;
    if (typeof this.value === 'string') {
      this.value = this.value.replace(/%/g, '$');
    }

    this.hook = this.serverless.configurationInput.custom.extendConfig.hook;
    if (this.hook !== undefined) {
      this.hooks = {
        [this.hook]: () => this.extend(),
      };
    } else {
      this.hook = 'async init';
    }
  }

  async asyncInit() {
    if (this.hooks === undefined) {
      this.extend();
    }
  }

  extend() {
    this.utils.log(`Excuting "${this.hook}" for extension of "${this.target}" with: ${this.value}`);
    this.serverless.extendConfiguration(this.target, this.value);
  }
};
