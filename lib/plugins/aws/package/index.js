'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const validate = require('../lib/validate');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const generateCompiledTemplate = require('./lib/generateCompiledTemplate');
const mergeIamTemplates = require('./lib/mergeIamTemplates');
const zipService = require('./lib/zipService');
const packageService = require('./lib/packageService');
const cleanup = require('./lib/cleanup');

class AwsPackage {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.packagePath = this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.config.servicePath, '.serverless');
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      cleanup,
      validate,
      packageService,
      zipService,
      generateCoreTemplate,
      mergeIamTemplates,
      generateArtifactDirectoryName,
      mergeCustomProviderResources,
      generateCompiledTemplate
    );

    this.hooks = {
      'package:cleanup': () => BbPromise.bind(this)
        .then(this.cleanup),

      'package:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.packageService),

      'package:initialize': () => BbPromise.bind(this)
        .then(this.generateCoreTemplate)
        .then(this.mergeIamTemplates)
        .then(this.generateArtifactDirectoryName),

      'package:finalize': () => BbPromise.bind(this)
        .then(this.mergeCustomProviderResources)
        .then(this.generateCompiledTemplate),
    };
  }
}

module.exports = AwsPackage;
