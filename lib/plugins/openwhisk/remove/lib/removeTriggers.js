'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  removeTriggerHandler(Trigger) {
    const onSuccess = ow => ow.triggers.delete(Trigger);
    const errMsgTemplate =
      `Failed to delete event trigger (${Trigger.triggerName}) due to error:`;
    const onErr = err => BbPromise.reject(
      new this.serverless.classes.Error(`${errMsgTemplate}: ${err.message}`)
    );

    return ClientFactory.fromWskProps().then(onSuccess).catch(onErr);
  },

  removeTrigger(triggerName) {
    const triggerObject = this.serverless.service.resources.triggers[triggerName];
    const Trigger = { triggerName };

    if (triggerObject.namespace) {
      Trigger.namespace = triggerObject.namespace;
    }

    return this.removeTriggerHandler(Trigger);
  },

  removeTriggers() {
    this.serverless.cli.log('Removing Triggers...');
    const resources = this.serverless.service.resources;

    if (!resources || !resources.triggers) {
      return BbPromise.resolve();
    }

    return BbPromise.all(
      Object.keys(resources.triggers).map(t => this.removeTrigger(t))
    );
  },
};
