'use strict';

const BbPromise = require('bluebird');

class OpenWhiskCompileTriggers {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'before:deploy:compileEvents': this.setup.bind(this),
      'deploy:compileEvents': this.compileTriggers.bind(this),
    };
  }

  setup() {
    this.serverless.service.triggers = {};
  }

  compileTrigger(name, params) {
    const trigger = { triggerName: name, overwrite: false };

    trigger.namespace = params.namespace
      || `${this.serverless.service.defaults.namespace}`;

    if (params.hasOwnProperty('overwrite')) {
      trigger.overwrite = params.overwrite;
    } else if (this.serverless.service.defaults.hasOwnProperty('overwrite')) {
      trigger.overwrite = params.overwrite;
    }

    if (params.parameters) {
      trigger.parameters = Object.keys(params.parameters).map(
        key => ({key, value: params.parameters[key]})
      );
    }

    return trigger;
  }

  compileTriggers() {
    this.serverless.cli.log('Compiling Triggers...');

    const manifestResources = this.serverless.service.resources;
    const owTriggers = this.serverless.service.triggers;

    if (!owTriggers) {
      throw new this.serverless.classes.Error(
        'Missing Triggers section from OpenWhisk Resource Manager template');
    }

    if (manifestResources && manifestResources.triggers) {
      Object.keys(manifestResources.triggers).forEach(trigger => {
        owTriggers[trigger] = this.compileTrigger(trigger, manifestResources.triggers[trigger]);
      });
     }

    return BbPromise.resolve();
  }
}

module.exports = OpenWhiskCompileTriggers;
