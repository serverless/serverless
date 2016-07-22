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

  compileTriggerFeed(trigger, feed, params) {
    const feedPathParts = feed.split('/').filter(i => i)
    const namespace = feedPathParts.splice(0, 1).join()
    const feedName = feedPathParts.join('/')

    return  { trigger, feedName, namespace, params };
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
        key => ({ key, value: params.parameters[key] })
      );
    }

    if (params.feed) {
      trigger.feed = this.compileTriggerFeed(
        `/${trigger.namespace}/${trigger.triggerName}`, params.feed, params.feed_parameters
      );
    }

    return trigger;
  }

  compileTriggers() {
    this.serverless.cli.log('Compiling Triggers & Feeds...');

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
