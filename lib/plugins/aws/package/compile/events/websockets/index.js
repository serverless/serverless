'use strict';

const BbPromise = require('bluebird');

const validate = require('./lib/validate');
const compileApi = require('./lib/api');
const compileIntegrations = require('./lib/integrations');
const compileRouteResponses = require('./lib/routeResponses');
const compilePermissions = require('./lib/permissions');
const compileRoutes = require('./lib/routes');
const compileDeployment = require('./lib/deployment');
const compileStage = require('./lib/stage');
const compileAuthorizers = require('./lib/authorizers');

class AwsCompileWebsockets {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      compileApi,
      compileIntegrations,
      compileRouteResponses,
      compileAuthorizers,
      compilePermissions,
      compileRoutes,
      compileDeployment,
      compileStage
    );

    this.hooks = {
      'package:compileEvents': () => {
        this.validated = this.validate();

        if (this.validated.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileApi)
          .then(this.compileIntegrations)
          .then(this.compileRouteResponses)
          .then(this.compileAuthorizers)
          .then(this.compilePermissions)
          .then(this.compileRoutes)
          .then(this.compileStage)
          .then(this.compileDeployment);
      },
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'websocket', {
      anyOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            route: { type: 'string' },
            routeResponseSelectionExpression: {
              type: 'string',
              regexp: /^(?:\$default)$/.toString(),
            },
            authorizer: {
              anyOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    identitySource: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    arn: { type: 'string' },
                    identitySource: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['arn'],
                  additionalProperties: false,
                },
              ],
            },
          },
          required: ['route'],
          additionalProperties: false,
        },
      ],
    });
  }
}

module.exports = AwsCompileWebsockets;
