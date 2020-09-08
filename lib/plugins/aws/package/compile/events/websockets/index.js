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

const standardRoutes = new Set(['connect', 'disconnect', 'default']);
const routePattern = new RegExp(`^(?:[^$].*|\\$(${Array.from(standardRoutes).join('|')}))$`, 'i');

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

    // TODO: Complete schema, see https://github.com/serverless/serverless/issues/8019
    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'websocket', {
      anyOf: [
        { type: 'string', regexp: routePattern.toString() },
        {
          type: 'object',
          if: { properties: { route: { type: 'string', regexp: /\$connect/.toString() } } },
          then: {
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
                      anyOf: [
                        { name: { type: 'string' } },
                        {
                          arn: {
                            type: 'string',
                            regexp: / /.toString() /* need to add regexp to check arn (maybe)*/,
                          },
                        },
                      ],
                      identitySource: {
                        type: 'array',
                        items: { type: 'string' },
                      } /* need to add regexp to check identity source strings (maybe)*/,
                    },
                  },
                ],
              },
            },
          },
          else: {
            properties: {
              route: { type: 'string', regexp: routePattern.toString() },
              routeResponseSelectionExpression: {
                type: 'string',
                regexp: /^(?:\$default)$/.toString(),
              },
              // need to fluff out the authorizer but otherwise done with event properties
              // use if-then keywords https://github.com/ajv-validator/ajv/blob/master/KEYWORDS.md#ifthenelse
            },
          },
        },
      ],
    });
  }
}

module.exports = AwsCompileWebsockets;
