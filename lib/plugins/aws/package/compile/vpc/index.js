'use strict';

const BbPromise = require('bluebird');
const compileVpc = require('./lib/vpc');
const compilePublicSubnets = require('./lib/publicSubnets');
const compilePrivateSubnets = require('./lib/privateSubnets');
const compileInternetGateway = require('./lib/internetGateway');
const compileSecurityGroup = require('./lib/securityGroup');

class AwsCompileVpc {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      compileVpc,
      compilePublicSubnets,
      compilePrivateSubnets,
      compileInternetGateway,
      compileSecurityGroup
    );

    this.hooks = {
      'package:compileVpc': () => {
        const { vpc } = this.serverless.service;

        if (
          (typeof vpc === 'boolean' && vpc) ||
          (typeof vpc === 'object' && Object.keys(vpc).length > 0)
        ) {
          return BbPromise.bind(this)
            .then(this.compileVpc)
            .then(this.compilePublicSubnets)
            .then(this.compilePrivateSubnets)
            .then(this.compileInternetGateway)
            .then(this.compileSecurityGroup);
        }

        return BbPromise.resolve();
      },
    };
  }
}

module.exports = AwsCompileVpc;
