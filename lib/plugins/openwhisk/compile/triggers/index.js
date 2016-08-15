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
    // This object will be used to store the Trigger resources, passed directly to
    // the OpenWhisk SDK during the deploy process.
    this.serverless.service.triggers = {};
  }

  // Trigger identifiers are composed of a namespace and a name.
  // The name may optionally include a package identifier.
  //
  // Valid examples shown here:
  //
  // /james.thomas@uk.ibm.com/myPackage/myTrigger
  // /james.thomas@uk.ibm.com/myTrigger
  compileTriggerFeed(trigger, feed, params) {
    const feedPathParts = feed.split('/').filter(i => i);
    const namespace = feedPathParts.splice(0, 1).join();
    const feedName = feedPathParts.join('/');

    return { trigger, feedName, namespace, params };
  }

  //
  // This method takes the trigger definitions, parsed from the user's YAML file,
  // and turns it into the OpenWhisk Trigger resource object.
  //
  // These resource objects are passed to the OpenWhisk SDK to create the associated Triggers
  // during the deployment process.
  //
  // Parameter values will be parsed from the user's YAML definition, either as a value from
  // the trigger definition or the service provider defaults.
  compileTrigger(name, params) {
    const trigger = { triggerName: name, overwrite: true };

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

    // binding triggers to event feeds is sent as a separate API request
    // once triggers have been created.
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
