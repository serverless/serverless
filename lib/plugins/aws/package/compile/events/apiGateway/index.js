'use strict';

const BbPromise = require('bluebird');

const validate = require('./lib/validate');
const compileRestApi = require('./lib/restApi');
const compileApiKeys = require('./lib/apiKeys');
const compileUsagePlan = require('./lib/usagePlan');
const compileUsagePlanKeys = require('./lib/usagePlanKeys');
const compileResources = require('./lib/resources');
const compileCors = require('./lib/cors');
const compileMethods = require('./lib/method/index');
const compileAuthorizers = require('./lib/authorizers');
const compileDeployment = require('./lib/deployment');
const compilePermissions = require('./lib/permissions');
const getMethodAuthorization = require('./lib/method/authorization');
const getMethodIntegration = require('./lib/method/integration');
const getMethodResponses = require('./lib/method/responses');

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      compileRestApi,
      compileApiKeys,
      compileUsagePlan,
      compileUsagePlanKeys,
      compileResources,
      compileCors,
      compileMethods,
      compileAuthorizers,
      compileDeployment,
      compilePermissions,
      getMethodAuthorization,
      getMethodIntegration,
      getMethodResponses
    );

    this.hooks = {
      'package:compileEvents': () => {
        this.validated = this.validate();

        if (this.validated.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileRestApi)
          .then(this.compileResources)
          .then(this.compileCors)
          .then(this.compileMethods)
          .then(this.compileAuthorizers)
          .then(this.compileDeployment)
          .then(this.compileApiKeys)
          .then(this.compileUsagePlan)
          .then(this.compileUsagePlanKeys)
          .then(this.compilePermissions);
      },

      // TODO should be removed once AWS fixes the removal via CloudFormation
      'before:remove:remove': () => {
        const validate = require('../../../../lib/validate').validate; // eslint-disable-line
        const disassociateUsagePlan = require('./lib/disassociateUsagePlan').disassociateUsagePlan; // eslint-disable-line

        return BbPromise.bind(this)
          .then(validate)
          .then(disassociateUsagePlan);
      },
    };
  }
}

module.exports = AwsCompileApigEvents;
