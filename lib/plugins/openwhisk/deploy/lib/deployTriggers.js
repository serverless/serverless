'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  deployTrigger(trigger) {
    return ClientFactory.fromWskProps().then(ow =>
      ow.triggers.create(trigger).catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to deploy trigger (${trigger.triggerName}) due to error: ${err.message}`
        );
      })
    );
  },

  deployTriggers() {
    this.serverless.cli.log('Deploying Triggers...');
    const triggers = this.serverless.service.triggers;
    return BbPromise.all(
      Object.keys(triggers)
        .map(t => Object.assign({}, triggers[t], { feed: undefined }))
        .map(t => this.deployTrigger(t))
    );
  },
};
