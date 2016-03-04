'use strict';

/**
 * Action: ResourcesRemove
 * - Removes the cloudformation/resources-cf.json template from AWS
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'Error')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    fs         = BbPromise.promisifyAll(require('fs'));
  let SUtils;

  class ResourcesRemove extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    /**
     * Define your plugins name
     */

    static getName() {
      return 'serverless.core.' + ResourcesRemove.name;
    }

    /**
     * @returns {Promise} upon completion of all registrations
     */

    registerActions() {
      this.S.addAction(this.resourcesRemove.bind(this), {
        handler:       'resourcesRemove',
        description:   `Remove AWS resources (resources-cf.json).
usage: serverless resources remove`,
        context:       'resources',
        contextAction: 'remove',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to remove from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to remove from'
          },
          {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just remove it. Default: false'
          }

        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    resourcesRemove(evt) {

      let _this    = this;
      _this.evt    = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._removeResources)
        .then(function(stackName) {

          /**
           * Return EVT
           */

          _this.evt.data.stackName = stackName;
          return _this.evt;

        })
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S.config.interactive || (_this.evt.options.stage && _this.evt.options.region)) return BbPromise.resolve();

      return _this.cliPromptSelectStage('Which stage are you removing resources from: ', _this.evt.options.stage, false)
        .then(stage => {
          _this.evt.options.stage = stage;
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Which region are you removing resources from: ', false, true, _this.evt.options.region, _this.evt.options.stage)
            .then(region => {
              _this.evt.options.region = region;
              BbPromise.resolve();
            });
        });
    }

    /**
     * Validate & Prepare
     */

    _validateAndPrepare() {
      let _this = this;

      // Non interactive validation
      if (!_this.S.config.interactive) {

        // Check Params
        if (!_this.evt.options.stage || !_this.evt.options.region) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.S.getProject().validateStageExists(_this.evt.options.stage) && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project'));
      }

      // Validate region: make sure region exists in stage
      if (!_this.S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
      }
    }

    /**
     * Remove CloudFormation Resources
     */

    _removeResources() {

      let _this       = this,
        stage         = _this.evt.options.stage,
        region        = _this.evt.options.region,
        regionVars    = _this.S.getProject().getRegion(stage, region).getVariables(),
        projectBucket = _this.S.getProject().getVariables().projectBucket,
        projectName   = _this.S.getProject().getName(),
        aws           = _this.S.getProvider();

      let stackName = (regionVars.resourcesStackName ||  aws.getResourcesStackName(stage, projectName));

      SCli.log(`Removing resources from stage "${stage}" in region "${region}" via Cloudformation (~3 minutes)...`);

      // Start spinner
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      let removeCfStack = function() {
        SUtils.sDebug(`Removing "${stackName}" CF stack`);
        return aws.request('CloudFormation', 'deleteStack', {StackName: stackName}, stage, region);
      };

      let removeLocalResourceFile = function() {
        let fileName = `s-resources-cf-${stage}-${region.replace(/-/g, '')}.json`;
        let resourcesLocalFilePath = _this.S.getProject().getRootPath('_meta', 'resources', fileName);

        if (SUtils.fileExistsSync(resourcesLocalFilePath)) {
          SUtils.sDebug(`Removing resources file "${fileName}"`);
          return fs.unlinkAsync(resourcesLocalFilePath);
        } else {
          SUtils.sDebug(`Resources file "${fileName}" is not found. Skipping.`);
          return BbPromise.resolve();
        }
      };

      let removeCfResourcePromise;

      if (_this.evt.options.noExeCf) {
        SCli.log('Notice -- You have chosen not to remove your resources from CloudFormation.');
        removeCfResourcePromise = BbPromise.resolve();
      } else {
        removeCfResourcePromise = removeCfStack()
      }

      return removeCfResourcePromise
        .then(removeLocalResourceFile)
        .then(function() {
          _this._spinner.stop(true);
          SCli.log(`Successfully removed "${stage}" resources from "${region}"`);
          return stackName;
        });
    }
  }

  return ResourcesRemove;
};
