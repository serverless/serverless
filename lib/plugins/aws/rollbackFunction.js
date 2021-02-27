'use strict';

const validate = require('./lib/validate');
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
            lifecycleEvents: ['rollback'],
            options: {
              'function': {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              'function-version': {
                usage: 'Version of the function',
                required: true,
              },
              'stage': {
                usage: 'Stage of the function',
                shortcut: 's',
              },
              'region': {
                usage: 'Region of the function',
                shortcut: 'r',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'rollback:function:rollback': async () => {
        await this.validate();
        const func = await this.getFunctionToBeRestored();
        const funcCode = await this.fetchFunctionCode(func);
        await this.restoreFunction(funcCode);
      },
    };
  }

  async getFunctionToBeRestored() {
    const funcName = this.options.function;
    let funcVersion = this.options['function-version'];

    // versions need to be string so that AWS understands it
    funcVersion = String(this.options['function-version']);

    this.serverless.cli.log(`Rolling back function "${funcName}" to version "${funcVersion}"...`);

    const funcObj = this.serverless.service.getFunction(funcName);

    const params = {
      FunctionName: funcObj.name,
      Qualifier: funcVersion,
    };

    try {
      return this.provider.request('Lambda', 'getFunction', params);
    } catch (error) {
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
    }
  }

  async fetchFunctionCode(func) {
    const codeUrl = func.Code.Location;

    const response = await fetch(codeUrl);
    return response.buffer();
  }

  async restoreFunction(zipBuffer) {
    const funcName = this.options.function;

    this.serverless.cli.log('Restoring function...');

    const funcObj = this.serverless.service.getFunction(funcName);

    const params = {
      FunctionName: funcObj.name,
      ZipFile: zipBuffer,
    };

    await this.provider.request('Lambda', 'updateFunctionCode', params);
    this.serverless.cli.log(`Successfully rolled back function "${this.options.function}"`);
  }
}

module.exports = AwsRollbackFunction;
