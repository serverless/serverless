'use strict';

/**
 * Action: ResourcesRemove
 * - Removes the cloudformation/resources-cf.json template from AWS
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    replaceall = require('replaceall'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils/index')),
    _          = require('lodash'),
    fs         = BbPromise.promisifyAll(require('fs'));

  class ResourcesRemove extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
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
        .then(function() {

          /**
           * Return EVT
           */

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

      return _this.cliPromptSelectStage('Which stage are you removing from: ', _this.evt.options.stage, false)
        .then(stage => {
          _this.evt.options.stage = stage;
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Which region are you removing from: ', false, true, _this.evt.options.region, _this.evt.options.stage)
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

        // Check API Keys
        if (!_this.S._awsProfile) {
          if (!_this.S.config.awsAdminKeyId || !_this.S.config.awsAdminSecretKey) {
            return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
          }
        }
        // Check Params
        if (!_this.evt.options.stage || !_this.evt.options.region) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.S.state.validateStageExists(_this.evt.options.stage) && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project'));
      }

      // Validate region: make sure region exists in stage
      if (!_this.S.state.validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
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
        regionVars    = _this.S.state.getMeta().stages[stage].regions[region].variables,
        projectBucket = _this.S.state.getMeta().variables.projectBucket,
        projectPath   = _this.S.config.projectPath,
        projectName   = _this.S.state.getProject().name;

      // Config AWS Services
      let awsConfig = {
        region:          region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.CF = require('../utils/aws/CloudFormation')(awsConfig);
      _this.S3 = require('../utils/aws/S3')(awsConfig);

      _this.S3.sSetProjectBucketConfig(projectBucket);

      SCli.log(`Removing resources from stage "${stage}" in region "${region}" via Cloudformation (~3 minutes)...`);

      let listS3Objects = function() {
        SUtils.sDebug("List related S3 objects");

        let prefix = ['serverless', projectName, stage, region, 'resources'].join('/'),
          params = {
            Bucket: projectBucket,
            Prefix: prefix
          };

        return _this.S3.listObjectsPromised(params)
          .then(function(reply) {
            return _.map(reply.Contents, (item) => ({Key: item.Key}) );
          });
      };

      let removeS3Objects = function(objects) {
        SUtils.sDebug("Removing related S3 objects");

        if (objects.length) {
          let params = {
              Bucket: projectBucket,
              Delete: {
                Objects: objects
              }
            };
          return _this.S3.deleteObjectsPromised(params)
        } else {
          SUtils.sDebug("S3 objects are not found. Skipping.");
          return BbPromise.resolve();
        }
      };

      let removeCfStack = function() {
        SUtils.sDebug(`Removing "${regionVars.resourcesStackName}" CF stack`);
        return _this.CF.deleteStackPromised({StackName: regionVars.resourcesStackName});
      };

      let removeLocalResourceFile = function() {
        let fileName = `s-resources-cf-${stage}-${replaceall('-', '', region)}.json`;
        let resourcesLocalFilePath = path.join(projectPath, '_meta', 'resources', fileName);

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
        removeCfResourcePromise = listS3Objects().then(removeS3Objects).then(removeCfStack);
      }

      return removeCfResourcePromise
        .then(removeLocalResourceFile)
        .then(function() {
          return SCli.log(`Successfully removed "${stage}" resources from "${region}"`);
        });
    }
  }

  return ResourcesRemove;
};
