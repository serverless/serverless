'use strict';

/**
 * Action: ResourcesDeploy
 * - Deploys/Updates the cloudformation/resources-cf.json template to AWS
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    replaceall   = require('replaceall'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    SUtils       = require(path.join(serverlessPath, 'utils/index'));

  class ResourcesDeploy extends SPlugin {

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
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    resourcesDeploy(evt) {

      let _this    = this;
      _this.evt    = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._deployResources)
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

      return _this.cliPromptSelectStage('Which stage are you deploying to: ', _this.evt.options.stage, false)
        .then(stage => {
          _this.evt.options.stage = stage;
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Which region are you deploying to: ', false, true, _this.evt.options.region, _this.evt.options.stage)
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
     * Deploy CloudFormation Resources
     */

    _deployResources() {

      let _this     = this;
      let regionVars = _this.S.state.getMeta().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables;

      return _this.S.state.getResources({
          populate: true,
          stage:    _this.evt.options.stage,
          region:   _this.evt.options.region
        })
        .then(function(resources) {

          _this.cfTemplate = resources;
          console.log(resources);
          // Create CloudFormation template in _meta folder
          return SUtils.writeFile(
            _this.S.project.getFilePath('_meta', 'resources', 's-resources-cf-' + _this.evt.options.stage + '-' + replaceall('-', '', _this.evt.options.region) + '.json'),
            JSON.stringify(_this.cfTemplate, null, 2))

        })
        .then(function() {

          // If no NoExeCF is set, skip
          if (_this.evt.options.noExeCf) {

            // Status
            SCli.log('Notice -- You have chosen not to deploy your resources to CloudFormation.  ' +
              'A CloudFormation template has been saved here: _meta/resources/' +
              's-resources-cf-' + _this.evt.options.stage + '-' + replaceall('-', '', _this.evt.options.region) + '.json');

            // Return
            return;
          }

          // Config AWS Services
          let awsConfig = {
            region:          _this.evt.options.region,
            accessKeyId:     _this.S.config.awsAdminKeyId,
            secretAccessKey: _this.S.config.awsAdminSecretKey
          };
          _this.CF  = require('../utils/aws/CloudFormation')(awsConfig);
          _this.S3  = require('../utils/aws/S3')(awsConfig);

          // Otherwise, deploy to CloudFormation
          SCli.log('Deploying resources to stage "'
            + _this.evt.options.stage
            + '" in region "'
            + _this.evt.options.region
            + '" via Cloudformation (~3 minutes)...');

          // Start spinner
          _this._spinner = SCli.spinner();
          _this._spinner.start();

          // Upload to S3 Bucket
          return _this.S3.sPutCfFile(
            _this.S.state.getMeta().variables.projectBucket,
            _this.S.state.getProject().name,
            _this.evt.options.stage,
            _this.evt.options.region,
            _this.cfTemplate
            )
            .then(function(templateUrl) {

              // Trigger CF Stack Create/Update
              return _this.CF.sCreateOrUpdateResourcesStack(
                _this.S.state.getProject().name,
                _this.evt.options.stage,
                _this.evt.options.region,
                regionVars.resourcesStackName ? regionVars.resourcesStackName : null,
                templateUrl)
                .then(cfData => {

                  // If string, log output
                  if (typeof cfData === 'string') {
                    _this._spinner.stop(true);
                    SCli.log(cfData);
                    return;
                  }

                  // Monitor CF Status
                  return _this.CF.sMonitorCf(cfData)
                    .then(cfStackData => {

                      // Save stack name
                      regionVars.resourcesStackName = cfStackData.StackName;

                      // Save IAM Role ARN for Project Lambdas
                      for (let i = 0; i < cfStackData.Outputs.length; i++) {
                        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
                          regionVars.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
                        }
                      }
                    })
                    .then(() => {

                      // Stop Spinner
                      _this._spinner.stop(true);

                      // Save State
                      _this.S.state.save();

                      // Status
                      SCli.log('Successfully deployed "' + _this.evt.options.stage + '" resources to "' + _this.evt.options.region + '"');
                    });
                })
            })
            .catch(function(e) {

              // Stop Spinner
              _this._spinner.stop(true);

              throw new SError(e);
            })
        });
    }
  }

  return( ResourcesDeploy );
};
