'use strict';

const BbPromise = require('bluebird');
const openwhisk = require('openwhisk');

module.exports = {
  openWhiskClientFactory() {
    const defaults = this.serverless.service.defaults;
    return openwhisk({ api: defaults.apihost, api_key: defaults.auth });
  },

  deployTrigger(trigger) {
    const ow = this.openWhiskClientFactory();
    return ow.triggers.create(trigger).catch(err => {
      throw new this.serverless.classes.Error(
        `Failed to deploy trigger (${trigger.triggerName}) due to error: ${err.message}`
      );
    });
  },

  deployTriggers() {
    this.serverless.cli.log('Deploying Triggers...');
    const triggers = this.serverless.service.triggers;
    return BbPromise.all(
      Object.keys(triggers).map(t => this.deployTrigger(triggers[t]))
    );
  },
};
