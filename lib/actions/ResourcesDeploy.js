'use strict';

/**
 * Action: ResourcesDeploy
 * - Deploys/Updates the cloudformation/resources-cf.json template to AWS
 *
 * Event Properties:
 * stage     (String) the name of the stage you want to deploy resources to. Must exist in project.
 * region    (String) the name of the region you want to deploy resources to. Must exist in provided stage.
 */

module.exports = function(SPlugin, serverlessPath) {

  const path = require('path'),
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
      this.evt = {};
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
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          },
        ],
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    resourcesDeploy(evt) {

      let _this = this;

      if(evt) {
        _this.evt = evt;
        _this.S._interactive = false;
      }

      // If CLI and not subaction, parse options
      if (_this.S.cli && (!evt || !evt._subaction)) {
        _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (_this.S.cli.options.nonInteractive) _this.S._interactive = false;
      }

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._updateResources)
          .then(() => {
            _this._spinner.stop(true);
            SCli.log('Resource Deployer:  Successfully deployed ' + _this.evt.stage + ' resources to ' + _this.evt.region.region);
            return _this.evt;
          });
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S._interactive || (_this.evt.stage && _this.evt.region)) return BbPromise.resolve();

      return _this.cliPromptSelectStage('Which stage are you deploying to: ', _this.evt.stage, false)
          .then(stage => {
            _this.evt.stage = stage;
            BbPromise.resolve();
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Which region are you deploying to: ', false, true, _this.evt.region, _this.evt.stage)
                .then(region => {
                  _this.evt.region = region;
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
      if (!_this.S._interactive) {

        // Check API Keys
        if (!_this.S._awsProfile) {
          if (!_this.S._awsAdminKeyId || !_this.S._awsAdminSecretKey) {
            return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
          }
        }
        // Check Params
        if (!_this.evt.stage || !_this.evt.region) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.S._meta.private.stages[_this.evt.stage] && _this.evt.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure region exists in stage
      if (!_this.S._meta.private.stages[_this.evt.stage].regions[_this.evt.region]) {
        return BbPromise.reject(new SError('Region "' + _this.evt.region + '" does not exist in stage "' + _this.evt.stage + '"'));
      }

      // Get full region config
      _this.evt.region = SUtils.getRegionConfig(_this.S._meta, _this.evt.stage, _this.evt.region);
    }

    /**
     * Update CloudFormation Resources
     */

    _updateResources() {

      let _this = this;

      SCli.log('Deploying resources to stage  "'
          + _this.evt.stage
          + '" and region "'
          + _this.evt.region.region
          + '" via Cloudformation.  This could take a while depending on how many resources you are updating...');

      // Start spinner
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      let awsConfig = {
        region:          _this.evt.region.region,
        accessKeyId:     _this.S._awsAdminKeyId,
        secretAccessKey: _this.S._awsAdminSecretKey,
      };
      _this.CF  = require('../utils/aws/CloudFormation')(awsConfig);

      // Create or update CF Stack
      return _this.CF.sCreateOrUpdateResourcesStack(
          _this.S,
          _this.evt.stage,
          _this.evt.region.region,
          'update')
          .then(cfData => {

            // Monitor CF Update
            return _this.CF.sMonitorCf(cfData, 'update');
          })
          .catch(function(e) {

            if (e.message.indexOf('does not exist') !== -1) {

              return _this.CF.sCreateOrUpdateResourcesStack(
                  _this.S,
                  _this.evt.stage,
                  _this.evt.region.region,
                  'create')
                  .then(cfData => {

                    // Monitor CF Create
                    return _this.CF.sMonitorCf(cfData, 'create')
                        .then(cfStackData => {

                          _this._spinner.stop(true);

                          if (cfStackData) {
                            for (let i = 0; i < cfStackData.Outputs.length; i++) {
                              if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
                                _this.evt.region.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
                              }
                            }
                          }
                        });
                  });

            } else {
              if (e.message.indexOf('No updates are to be performed.') !== -1) {
                return BbPromise.resolve({});
              } else {
                return BbPromise.reject(new SError(e));
              }
            }
          });
    }
  }

  return( ResourcesDeploy );
};
