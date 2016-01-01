'use strict';

/**
 * Action: ResourcesDeploy
 * - Deploys/Updates the cloudformation/resources-cf.json template to AWS
 *
 * Options:
 * stage     (String) the name of the stage you want to deploy resources to. Must exist in project.
 * region    (String) the name of the region you want to deploy resources to. Must exist in provided stage.
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    replaceall = require('replaceall'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils/index'));

  class ResourcesDeploy extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
      this.options = {};
    }

    /**
     * Define your plugins name
     */

    static getName() {
      return 'serverless.core.' + ResourcesDeploy.name;
    }

    /**
     * @returns {Promise} upon completion of all registrations
     */

    registerActions() {
      this.S.addAction(this.resourcesDeploy.bind(this), {
        handler:       'resourcesDeploy',
        description:   `Provision AWS resources (resources-cf.json).
usage: serverless resources deploy`,
        context:       'resources',
        contextAction: 'deploy',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to deploy to'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to deploy to'
          },
          {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
          },
          {
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    resourcesDeploy(options) {

      let _this    = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      // Get Meta instance
      this.meta = new this.S.classes.Meta(this.S, {
        projectPath: this.S.config.projectPath
      });
      // Get Project instance
      this.project = new this.S.classes.Project(this.S, {
        projectPath: this.S.config.projectPath
      });

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._updateResources)
        .then(function() {

          // Return
          return _this.options;
        })
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S.config.interactive || (_this.options.stage && _this.options.region)) return BbPromise.resolve();

      return _this.cliPromptSelectStage('Which stage are you deploying to: ', _this.options.stage, false)
        .then(stage => {
          _this.options.stage = stage;
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Which region are you deploying to: ', false, true, _this.options.region, _this.options.stage)
            .then(region => {
              _this.options.region = region;
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
        if (!_this.options.stage || !_this.options.region) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.meta.data.private.stages[_this.options.stage] && _this.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.options.stage + ' does not exist in your project'));
      }

      // Validate region: make sure region exists in stage
      if (!_this.meta.data.private.stages[_this.options.stage].regions[_this.options.region]) {
        return BbPromise.reject(new SError('Region "' + _this.options.region + '" does not exist in stage "' + _this.options.stage + '"'));
      }
    }

    /**
     * Update CloudFormation Resources
     */

    _updateResources() {

      let _this = this;
      let regionVars = _this.meta.data.private.stages[_this.options.stage].regions[_this.options.region].variables;

      // Config AWS Services
      let awsConfig = {
        region:          _this.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };
      _this.CF  = require('../utils/aws/CloudFormation')(awsConfig);

      // Build CF Template
      _this.cfTemplate = _this.project.getResources(_this.options.stage, _this.options.region);

      // Persist CF Template to Filesystem
      return SUtils.writeFile(

        path.join(_this.S.config.projectPath, 'meta', 'private', 'resources', 's-resources-cf-' + _this.options.stage + '-' + replaceall('-', '', _this.options.region) + '.json'),
        JSON.stringify(_this.cfTemplate, null, 2))
        .then(function() {

          // If no NoExeCF is set, skip
          if (_this.options.noExeCf) {

            // Status
            SCli.log('You have chosen not to deploy your resources to CloudFormation.  ' +
              'A CloudFormation template has been saved here: meta/private/resources/' +
              's-resources-cf-' + _this.options.stage + '-' + replaceall('-', '', _this.options.region) + '.json');

            // Return
            return;
          }

          // Otherwise, deploy to CloudFormation
          SCli.log('Deploying resources to stage  "'
            + _this.options.stage
            + '" and region "'
            + _this.options.region
            + '" via Cloudformation.  This could take a while depending on how many resources you are updating...');

          // Start spinner
          _this._spinner = SCli.spinner();
          _this._spinner.start();

          // Upload to S3 Bucket
          return _this.CF.sPutCfFile(
            _this.S.config.projectPath,
            _this.project.data.name,
            _this.meta.data.private.variables.projectBucket,
            _this.options.stage,
            _this.options.region,
            _this.cfTemplate
            )
            .then(function(templateUrl) {

              // Trigger CF Stack Create/Update
              return _this.CF.sCreateOrUpdateResourcesStack(
                _this.project.data.name,
                _this.options.stage,
                _this.options.region,
                regionVars.resourcesStackName ? regionVars.resourcesStackName : null,
                templateUrl)
                .then(cfData => {

                  // Monitor CF Status
                  return _this.CF.sMonitorCf(cfData, regionVars.resourcesStackName ? 'update' : 'create')
                    .then(cfStackData => {

                      _this._spinner.stop(true);

                      // Save stack name
                      regionVars.resourcesStackName = cfStackData.StackName;

                      // Save IAM Role ARN for Project Lambdas
                      for (let i = 0; i < cfStackData.Outputs.length; i++) {
                        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
                          regionVars.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
                        }
                      }
                    });
                });
            })
            .then(() => {

              // Save Meta
              _this.meta.save();

              // Status
              SCli.log('Resource Deployer:  Successfully deployed ' + _this.options.stage + ' resources to ' + _this.options.region);
            });
        });
    }
  }

  return( ResourcesDeploy );
};
