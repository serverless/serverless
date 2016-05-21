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
        lifeCycleEvents: [
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
    BbPromise.promisifyAll(this.Lambda, {suffix: 'Promised'});
  }

  deploy() {
    return this.S.instances.service.getAllFunctions().forEach((f) => {
      const params = {
        FunctionName: `${this.S.instances.service.service}-${f}`,
        ZipFile: new Zip(),
      };
      return this.Lambda.updateFunctionCodePromised(params);
    });
  }
}

module.exports = Deploy;
