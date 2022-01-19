'use strict';

const BbPromise = require('bluebird');
const ServerlessError = require('../../serverless-error');
const validate = require('./lib/validate');
const fetch = require('node-fetch');
const { style, log, progress } = require('@serverless/utils/log');

const mainProgress = progress.get('main');

class AwsRollbackFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'rollback:function:rollback': async () =>
        BbPromise.bind(this)
          .then(this.validate)
          .then(this.getFunctionToBeRestored)
          .then(this.fetchFunctionCode)
          .then(this.restoreFunction),
    };
  }

  async getFunctionToBeRestored() {
    const funcName = this.options.function;
    let funcVersion = this.options['function-version'];

    // versions need to be string so that AWS understands it
    funcVersion = String(this.options['function-version']);

    log.notice();
    log.notice(`Rolling back function ${funcName} to version "${funcVersion}"`);
    log.info(); // Ensure gap between verbose logging

    mainProgress.notice('Updating', { isMainEvent: true });

    const funcObj = this.serverless.service.getFunction(funcName);

    const params = {
      FunctionName: funcObj.name,
      Qualifier: funcVersion,
    };

    return this.provider
      .request('Lambda', 'getFunction', params)
      .then((func) => func)
      .catch((error) => {
        if (error.message.match(/not found/)) {
          const errorMessage = [
            `Function "${funcName}" with version "${funcVersion}" not found.`,
            ` Please check if you've deployed "${funcName}"`,
            ` and version "${funcVersion}" is available for this function.`,
            ' Please check the docs for more info.',
          ].join('');
          throw new ServerlessError(errorMessage, 'AWS_FUNCTION_NOT_FOUND');
        }
        throw new ServerlessError(
          `Cannot resolve function "${funcName}": ${error.message}`,
          'AWS_FUNCTION_NOT_ACCESIBLE'
        );
      });
  }

  async fetchFunctionCode(func) {
    const codeUrl = func.Code.Location;

    return fetch(codeUrl).then((response) => response.buffer());
  }

  async restoreFunction(zipBuffer) {
    const funcName = this.options.function;

    const funcObj = this.serverless.service.getFunction(funcName);

    const params = {
      FunctionName: funcObj.name,
      ZipFile: zipBuffer,
    };

    return this.provider.request('Lambda', 'updateFunctionCode', params).then(() => {
      log.notice();
      log.notice.success(
        `Successfully rolled back function ${funcName} to version "${
          this.options['function-version']
        }" ${style.aside(
          `(${Math.floor(
            (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
          )}s)`
        )}`
      );
    });
  }
}

module.exports = AwsRollbackFunction;
