'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const Zip = require('node-zip');

class Deploy {
  constructor(serverless) {
    this.serverless = serverless;
    this.commands = {
      deploy: {
        usage: 'deploy lambda zip.',
        lifecycleEvents: [
          'deploy',
        ],
      },
    };

    this.hooks = {
      'deploy:deploy': this.deploy,
    };

    const config = {
      region: 'us-east-1',
    };
    this.Lambda = new AWS.Lambda(config);
    BbPromise.promisifyAll(this.Lambda, { suffix: 'Promised' });
  }

  deploy(options) {
    this.options = options;
    const allPromises = [];
    this.serverless.service.getAllFunctions().forEach((f) => {
      const fConfig = this.serverless.service.getFunction(f);

      const configParams = {
        FunctionName: `${this.serverless.service.service}-${f}`,
        Description: fConfig.description,
        Handler: fConfig.handler,
        MemorySize: fConfig.memory_size,
        Timeout: fConfig.timeout,
      };

      allPromises.push(this.Lambda.updateFunctionConfigurationPromised(configParams));
      const codeParams = {
        FunctionName: `${this.serverless.service.service}-${f}`,
        ZipFile: new Zip(),
      };
      allPromises.push(this.Lambda.updateFunctionCodePromised(codeParams));
    });
    return BbPromise.all(allPromises);
  }
}

module.exports = Deploy;
