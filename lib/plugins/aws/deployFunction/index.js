'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const Zip = require('node-zip');
const SDK = require('../');
const validate = require('../lib/validate');

class AwsDeployFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = 'aws';
    this.sdk = new SDK(serverless);

    this.functionName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.function}`;

    Object.assign(this, validate);

    this.hooks = {
      'deploy:function:deploy': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.checkIfFunctionExists)
        .then(this.zipFunction)
        .then(this.deployFunction),
    };
  }

  checkIfFunctionExists() {
    // check if the function exists in the service
    this.serverless.service.getFunction(this.options.function);

    // check if function exists on AWS
    const params = {
      FunctionName: this.functionName,
    };

    this.sdk.request(
      'Lambda',
      'getFunction',
      params,
      this.options.stage, this.options.region
    ).catch(() => {
      const errorMessage = [
        `The function "${this.options.function}" you want to update is not yet deployed.`,
        ' Please run "serverless deploy" to deploy your service.',
        ' After that you can redeploy your services functions with the',
        ' "serverless deploy function" command.',
      ].join('');
      throw new this.serverless.classes
        .Error(errorMessage);
    });

    return BbPromise.resolve();
  }

  zipFunction() {
    this.serverless.cli.log('Zipping function...');
    const zip = new Zip();

    const servicePath = this.serverless.config.servicePath;
    const func = this.serverless.service.functions[this.options.function];

    const handler = (_.last(func.handler.split('/'))).replace(/\\g/, '/');
    const handlerFullPath = path.join(servicePath, handler);

    if (!handlerFullPath.endsWith(func.handler)) {
      const errorMessage = [
        `The handler ${func.handler} was not found.`,
        ' Please make sure you have this handler in your service at the referenced location.',
        ' Please check the docs for more info',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    const packageRoot = handlerFullPath.replace(func.handler, '');

    this.serverless.utils.walkDirSync(packageRoot).forEach((filePath) => {
      const relativeFilePath = path.relative(packageRoot, filePath);
      const permissions = fs.statSync(filePath).mode;
      zip.file(relativeFilePath, fs.readFileSync(filePath), { unixPermissions: permissions });
    });

    const data = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      platform: process.platform,
    });

    return BbPromise.resolve(data);
  }

  deployFunction(data) {
    const params = {
      FunctionName: this.functionName,
      ZipFile: data,
    };

    this.sdk.request(
      'Lambda',
      'updateFunctionCode',
      params,
      this.options.stage, this.options.region
    );

    this.serverless.cli.log(`Successfully deployed function "${this.options.function}"`);

    return BbPromise.resolve();
  }
}

module.exports = AwsDeployFunction;
