'use strict';

/**
 * Action: Endpoint Remove
 * - Removes Endpoints
 * - Loops sequentially through each Region in specified Stage
 *
 * Options:
 * - stage:              (String)  The stage to remove from
 * - region:             (String)  The region in the stage to remove from
 * - names:              (Array)   Array of endpoint paths to remove.  Format: ['users/show~GET']
 * - all:                (Boolean) Indicates whether all Endpoints in the project should be removed.
 */

module.exports = function(S) {

  const path     = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    BbPromise    = require('bluebird'),
    _            = require('lodash');

  class EndpointRemove extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.endpointRemove.bind(this), {
        handler:       'endpointRemove',
        description:   'Removes REST API endpoints',
        context:       'endpoint',
        contextAction: 'remove',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional if only one stage is defined in project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - Target one region to remove from'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Remove all Endpoints'
          }
        ],
        parameters: [
          {
            parameter: 'names',
            description: 'The names/ids of the endpoints you want to remove in this format: user/create~GET',
            position: '0->'
          }
        ]
      });

      return BbPromise.resolve();
    }

    endpointRemove(evt) {
      return EndpointRemover.run(evt);
    }
  }

  class EndpointRemover extends S.classes.Plugin {

    constructor(evt) {
      super();
      this.evt = evt;

      // Instantiate Classes
      this.project = S.getProject();
      this.aws     = S.getProvider('aws');
    }

    static run(evt, S) {
      const remover = new this(evt, S);
      return remover.endpointRemove();
    }

    endpointRemove(evt) {

      // Flow
      return BbPromise
        .try(() => {
          // Prompt: Stage
          if (!S.config.interactive || this.evt.options.stage) return BbPromise.resolve(this.evt.options.stage);

          return this.cliPromptSelectStage('Endpoint Remove - Choose a stage: ', this.evt.options.stage, false)
            .then(stage => this.evt.options.stage = stage)
        })
        .bind(this)
        .then(this._validateAndPrepare)
        .then(this._processRemoval)
        .then(() => {

          this._displaySuccessful();
          this._displayFailed();

          /**
           * Return EVT
           */

          this.evt.data.removed = this.removed;
          this.evt.data.failed   = this.failed;
          return this.evt;
        });
    }

    _displayFailed() {
      if(this.failed) {
        SCli.log(`Failed to remove endpoints in "${this.evt.options.stage}" from the following regions:`);
        _.each(this.failed, (failed, region) => {
          SCli.log(region + ' ------------------------');
          _.each(failed, (endpoint) => {
            SCli.log(`  ${endpoint.endpointMethod} - ${endpoint.endpointPath}: ${endpoint.message}`);
          });
        });

        SCli.log('');
        SCli.log('Run this again with --debug to get more error information...');
      }
    }

    _displaySuccessful() {
      if (this.removed) {
        SCli.log(`Successfully removed endpoints in "${this.evt.options.stage}" from the following regions:`);
        _.each(this.removed, (removed, region) => {
          SCli.log(region + ' ------------------------');
          _.each(removed, (endpoint) => {
            SCli.log(`  ${endpoint.endpointMethod} - ${endpoint.endpointPath} - ${endpoint.endpointUrl}`);
          });
        });
      }
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {
      let _this = this;
      // Set defaults
      this.evt.options.names  = this.evt.options.names || [];
      this.regions            = this.evt.options.region ? [this.evt.options.region] : this.project.getAllRegionNames(this.evt.options.stage);

      this.endpoints = _.map(this.evt.options.names, (name) => {
        const endpoint = this.project.getEndpoint(name);
        if (!endpoint) throw new SError(`Endpoint "${name}" doesn't exist in your project`);
        return endpoint;
      });

      // If CLI and no paths targeted, remove from CWD if Function
      if (S.cli && !this.endpoints.length && !this.evt.options.all) {
        let functionsByCwd = SUtils.getFunctionsByCwd(_this.project.getAllFunctions());

        functionsByCwd.forEach(function(func) {
          func.getAllEndpoints().forEach(function(endpoint) {
            _this.endpoints.push(endpoint);
          });
        });
      }

      // If --all is selected, load all paths
      if (this.evt.options.all) {
        this.endpoints = this.project.getAllEndpoints();
      }

      if (_.isEmpty(this.endpoints)) throw new SError(`You don't have any endpoints in your project`);

      // Validate Stage
      if (!this.evt.options.stage || !this.project.validateStageExists(this.evt.options.stage)) {
        throw new SError(`Stage is required`);
      }

      return BbPromise.resolve();
    }

    _processRemoval() {
      SCli.log(`Removing endpoints in "${this.evt.options.stage}" to the following regions: ${this.regions.join(', ')}`);
      let spinner = SCli.spinner();
      spinner.start();

      return BbPromise
        .map(this.regions, this._removeByRegion.bind(this))
        .then(() => spinner.stop(true)); // Stop Spinner
    }

    /**
     * Remove Endpoints By Region
     * - Finds a API Gateway in the region
     * - Removes all function endpoints queued in a specific region
     */

    _removeByRegion(region) {
      let restApiId,
          stage = this.evt.options.stage;

      let restApiName = this.project.getRegion(stage, region).getVariables()['apiGatewayApi'] || this.project.getName();

      return this.aws.getApiByName(restApiName, stage, region)
        .then((restApiData) => restApiId = restApiData.id)
        .then(() => this.aws.request('APIGateway', 'getResources', {restApiId, limit: 500}, stage, region))
        .then((response) => response.items)
        .then((resources) => {
          return BbPromise.map(this.endpoints, ((endpoint) => this._endpointRemove(endpoint, region, resources, restApiId)), {concurrency: 5});
        });
    }

    _endpointRemove(endpoint, region, resources, restApiId) {

      let stage = this.evt.options.stage,
          resource;

      let getResourceToRemove = function (res) {
        if (!res.parentId) return res.id;

        // check if parent resource has no other children
        if (_.filter(resources, {parentId: res.parentId}).length > 1) {
          return res.id;
        } else {
          let parentResource = _.find(resources, {id: res.parentId});
          // Skip if it's root - We can't remove the root resource.
          if(parentResource.path === '/') return res.id;
          return getResourceToRemove(parentResource);
        }
      }

      return BbPromise
        .try(() => {
          if (!endpoint) throw new SError(`Endpoint could not be found`);

          resource = _.find(resources, {path: '/' + endpoint.path} );

          if (!resource || !resource.resourceMethods[endpoint.method]) {
            throw new SError(`Endpoint "${endpoint.path}~${endpoint.method}" is not deployed in "${region}"`);
          }
        })
        .then(() => {
          let params = {
            restApiId: restApiId,
            resourceId: resource.id
          }

          if (_.keys(resource.resourceMethods).length > 1) {
            SUtils.sDebug(`Removing method "${endpoint.method}" of "${resource.path}" resource`);

            params.httpMethod = endpoint.method;
            delete resource.resourceMethods[endpoint.method];
            return this.aws.request('APIGateway', 'deleteMethod', params, stage, region);
          } else {
            // removing resource
            SUtils.sDebug(`Removing resource "${resource.path}"`);
            params.resourceId = getResourceToRemove(resource);
            delete resource.parentId;
            return this.aws.request('APIGateway', 'deleteResource', params, stage, region);
          }
        })
        .then((result) => {
          // Stash removed endpoints
          if (!this.removed) this.removed = {};
          if (!this.removed[region]) this.removed[region] = [];

          this.removed[region].push({
            endpointPath:     endpoint.path,
            endpointMethod:   endpoint.method,
            endpointUrl:      resource.path
          });

        })
        .catch((e) => {
          // Stash Failed Endpoint
          if (!this.failed) this.failed = {};
          if (!this.failed[region]) this.failed[region] = [];

          this.failed[region].push({
            endpointPath:     endpoint ? endpoint.path : 'unknown',
            endpointMethod:   endpoint ? endpoint.method : 'unknown',
            message:          e.message,
            stack:            e.stack
          });
        });

    }

  }


  return EndpointRemove;
};