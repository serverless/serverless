'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const Zip = require('node-zip');

class Deploy {
  constructor(S) {
    this.S = S;
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
    this.S.instances.service.getAllFunctions().forEach((f) => {
      const fConfig = this.S.instances.service.getFunction(f);

      const configParams = {
        FunctionName: `${this.S.instances.service.service}-${f}`,
        Description: fConfig.description,
        Handler: fConfig.handler,
        MemorySize: fConfig.memory_size,
        Timeout: fConfig.timeout,
      };

      allPromises.push(this.Lambda.updateFunctionConfigurationPromised(configParams));
      const codeParams = {
        FunctionName: `${this.S.instances.service.service}-${f}`,
        ZipFile: new Zip(),
      };
      allPromises.push(this.Lambda.updateFunctionCodePromised(codeParams));
    });
    return BbPromise.all(allPromises);
  }
}

module.exports = Deploy;
