'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const moment = require('moment');

class AzureInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'invoke:invoke': () => {
        return BbPromise.bind(this)
          .then(this.validate)
          .then(this.invoke)
          .then(this.log);
      },
    };
  }

  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    // validate stage/region/function exists in service
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, convertedRegion);
    this.serverless.service.getFunction(this.options.function);

    if (this.options.path) {
      if (!this.serverless.utils
          .fileExistsSync(path.join(this.serverless.config.servicePath, this.options.path))) {
        throw new this.serverless.classes.Error('The file path you provided does not exist.');
      }

      this.options.data = this.serverless.utils
        .readFileSync(path.join(this.serverless.config.servicePath, this.options.path));
    }

    // Todo: Resolve if we're confident that everything is ok and we actually
    // have a function we can invoke

    return BbPromise.resolve();
  }

  invoke() {
    // Todo: Return a promise invoking `${this.serverless.service.service}-${this.options.function}`,
    // resolving with the reply. handled by log() below
  }

  log(invocationReply) {
    // Todo: Log some pretty output
    // Maaaaaaaybe tail but make sure that the serverless log works
  }
}

module.exports = AwsInvoke;
