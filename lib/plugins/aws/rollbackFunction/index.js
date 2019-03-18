'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const fetch = require('node-fetch');

class AwsRollbackFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.commands = {
      rollback: {
        commands: {
          function: {
            usage: 'Rollback the function to a specific version',
            lifecycleEvents: [
              'rollback',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              version: {
                usage: 'Version of the function',
                shortcut: 'v',
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
        .then(this.getFunctionToBeRestored)
        .then(this.fetchFunctionCode)
        .then(this.restoreFunction),
    };
  }

  getFunctionToBeRestored() {
    const funcName = this.options.function;
    let funcVersion = this.options.version;

    // versions need to be string so that AWS understands it
    funcVersion = String(this.options.version);

    this.serverless.cli.log(`Rolling back function "${funcName}" to version "${funcVersion}"...`);

    const funcObj = this.serverless.service.getFunction(funcName);

    const params = {
      FunctionName: funcObj.name,
      Qualifier: funcVersion,
    };

    return this.provider.request(
      'Lambda',
      'getFunction',
      params
    )
    .then((func) => func)
    .catch((error) => {
      if (error.message.match(/not found/)) {
        const errorMessage = [
          `Function "${funcName}" with version "${funcVersion}" not found.`,
          ` Please check if you've deployed "${funcName}"`,
          ` and version "${funcVersion}" is available for this function.`,
          ' Please check the docs for more info.',
        ].join('');
        throw new Error(errorMessage);
      }
      throw new Error(error.message);
    });
  }

  fetchFunctionCode(func) {
    const codeUrl = func.Code.Location;

    return fetch(codeUrl).then((response) => response.buffer());
  }

  restoreFunction(zipBuffer) {
    const funcName = this.options.function;

    this.serverless.cli.log('Restoring function...');

    const funcObj = this.serverless.service.getFunction(funcName);

    const params = {
      FunctionName: funcObj.name,
      ZipFile: zipBuffer,
    };

    return this.provider.request(
      'Lambda',
      'updateFunctionCode',
      params
    ).then(() => {
      this.serverless.cli.log(`Successfully rolled back function "${this.options.function}"`);
    });
  }
}

module.exports = AwsRollbackFunction;
