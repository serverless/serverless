'use strict';

const BbPromise = require('bluebird');
const validate = require('./../lib/validate');
const request = require('request');
const bytes = require('bytes');

class AwsRollbackFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');
    this.request = request;

    Object.assign(this, validate);

    this.commands = {
      rollback: {
        commands: {
          function: {
            usage: 'Rollback the function to the previous version',
            lifecycleEvents: [
              'rollback',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              stage: {
                usage: 'Stage of the function',
                shortcut: 's',
              },
              region: {
                usage: 'Region of the function',
                shortcut: 'r',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'rollback:function:rollback': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.getPreviousFunction)
        .then(this.restoreFunction),
    };
  }

  getPreviousFunction() {
    this.serverless.cli.log(`Rollbacking function: ${this.options.function}...`);
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    const params = {
      FunctionName: this.options.functionObj.name,
      Qualifier: `${this.options.functionObj.name}-rollback`,
    };

    return this.provider.request(
      'Lambda',
      'getFunction',
      params,
      this.options.stage, this.options.region
    ).then((ret) => {
      this.previousFunc = ret;
    });
  }

  restoreFunction() {
    this.serverless.cli.log(
      `Uploading function: ${this.options.function} `
      + `(${bytes(this.previousFunc.Configuration.CodeSize)})...`
    );
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    const options = {
      method: 'GET',
      url: this.previousFunc.Code.Location,
      encoding: null,
    };

    this.request(options, (err, res, body) => {
      const params = {
        FunctionName: this.options.functionObj.name,
        ZipFile: body,
      };

      this.provider.request(
        'Lambda',
        'updateFunctionCode',
        params,
        this.options.stage, this.options.region
      ).then(() => {
        this.serverless.cli.log(`Successfully rollbacked function: ${this.options.function}`);
      });
    });

    return BbPromise.resolve();
  }
}

module.exports = AwsRollbackFunction;
