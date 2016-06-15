'use strict';

/**
 * Action: ResourcesDeploy
 * - Deploys/Updates the cloudformation/resources-cf.json template to AWS
 */

module.exports = function(S) {

  const path   = require('path'),
    replaceall = require('replaceall'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    _          = require('lodash'),
    async      = require('async');

  class ResourcesDeploy extends S.classes.Plugin {

    /**
     * Define your plugins name
     */

    static getName() {
      return 'serverless.core.' + this.name;
    }

    /**
     * @returns {Promise} upon completion of all registrations
     */

    registerActions() {
      S.addAction(this.resourcesDeploy.bind(this), {
        handler:       'resourcesDeploy',
        description:   'Provision AWS resources (s-resources-cf.json). Usage: serverless resources deploy',
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
            return _this.evt;
          });
    }

    /**
     * Prompt
     * - Select stage and region
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!S.config.interactive || (_this.evt.options.stage && _this.evt.options.region)) return BbPromise.resolve();

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
     * - Validate all data from event, interactive CLI or non interactive CLI and prepare data
     */

    _validateAndPrepare() {

      let _this = this;

      // Non interactive validation
      if (!S.config.interactive) {

        // Check Params
        if (!_this.evt.options.stage || !_this.evt.options.region) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!S.getProject().validateStageExists(_this.evt.options.stage) && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project'));
      }

      // Validate region: make sure region exists in stage
      if (!S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
      }
    }

    /**
     * Deploy CloudFormation Resources
     */

    _deployResources() {

      let _this  = this,
          region = S.getProject().getRegion(_this.evt.options.stage, _this.evt.options.region);

      return BbPromise.try(function() {
            return S.getProject().getAllResources().toObjectPopulated({
              stage: _this.evt.options.stage,
              region: _this.evt.options.region
            });
          })
          .then(function(resources) {

            _this.cfTemplate = resources;

            // Create CloudFormation template in _meta folder
            return SUtils.writeFile(
                S.getProject().getRootPath('_meta', 'resources', 's-resources-cf-' + _this.evt.options.stage + '-' + replaceall('-', '', _this.evt.options.region) + '.json'),
                JSON.stringify(_this.cfTemplate, null, 2))

          })
          .then(function() {

            // If no NoExeCF is set, skip
            if (_this.evt.options.noExeCf) {

              if (!_this.evt.options.quiet) {
                // Status
                SCli.log('Notice -- You have chosen not to deploy your resources to CloudFormation.  ' +
                    'A CloudFormation template has been saved here: _meta/resources/' +
                    's-resources-cf-' + _this.evt.options.stage + '-' + replaceall('-', '', _this.evt.options.region) + '.json');
              }

              // Return
              return;
            }

            // Otherwise, deploy to CloudFormation
            SCli.log('Deploying resources to stage "'
                + _this.evt.options.stage
                + '" in region "'
                + _this.evt.options.region
                + '" via Cloudformation (~3 minutes)...');

            // Start spinner
            _this._spinner = SCli.spinner();
            _this._spinner.start();

            return _this._createOrUpdateResourcesStack()
                .bind(_this)
                .then(cfData => {

                  // If string, log output
                  if (typeof cfData === 'string') {
                    _this._spinner.stop(true);
                    SCli.log(cfData);
                    return;
                  }

                  // Monitor CF Status
                  return _this._monitorCf(cfData)
                      .then(cfStackData => {

                        // Save stack name
                        region.addVariables({
                          resourcesStackName: cfStackData.StackName
                        });

                        let regionVariables = region.getVariables().toObject();

                        // Save IAM Role ARN for Project Lambdas
                        for (let i = 0; i < cfStackData.Outputs.length; i++) {

                          // Lowercase first letter
                          let varName = _.lowerFirst(cfStackData.Outputs[i].OutputKey);

                          // Add/Update variable
                          let v = {};
                          v[varName] = cfStackData.Outputs[i].OutputValue;
                          region.addVariables(v);

                          // Add OutputKey
                          if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
                            region.addVariables({
                              iamRoleArnLambda: cfStackData.Outputs[i].OutputValue
                            });
                          }
                        }
                      })
                      .then(() => {

                        // Stop Spinner
                        _this._spinner.stop(true);
                        region.save();

                        // Status
                        SCli.log('Successfully deployed "' + _this.evt.options.stage + '" resources to "' + _this.evt.options.region + '"');
                      });
                })
                .catch(function(e) {

                  // Stop Spinner
                  _this._spinner.stop(true);

                  throw new SError(e);
                })
          });
    }

    /**
     * Create Or Update Resources Stack
     * moved from lib/utils/aws/CloudFormation.js
     */

    _createOrUpdateResourcesStack() {

      const project 	  = S.getProject(),
      		projectName   = project.getName(),
    			stage         = this.evt.options.stage,
    			region        = this.evt.options.region,
    			aws           = S.getProvider('aws'),
    			stackName     = project.getRegion(stage, region).getVariables().resourcesStackName || aws.getResourcesStackName(stage, projectName);

      // CF Params
      let params = {
        Capabilities: [
          'CAPABILITY_IAM'
        ],
        Parameters:  [],
        TemplateBody: JSON.stringify(this.cfTemplate)
      };

      // Helper function to create Stack
      let createStack = () => {

      	let STags = [{
          Key:   'STAGE',
          Value: stage
        }];

        //Populate the s-project data with the variables
        let projectFilePopulated =  project.toObjectPopulated({stage: stage, region: region});

        _.forEach(projectFilePopulated.resourcesStackTags, function(value, key) {
            	STags.push({
            		Key: key,
            		Value: value
            	})
    		});

        params.Tags = STags;
        params.StackName = stackName;
        params.OnFailure = 'DELETE';
        return aws.request('CloudFormation', 'createStack', params, stage, region);
      };

      // Check to see if Stack Exists
      return aws.request('CloudFormation', 'describeStackResources', {StackName: stackName}, stage, region)
          .then(function(data) {

            params.StackName = stackName;

            // Update stack
            return aws.request('CloudFormation', 'updateStack', params, stage, region)
          })
          .catch(function(e) {

            // No updates are to be performed
            if (e.message == 'No updates are to be performed.') {
              return 'No resource updates are to be performed.';
            }

            // If does not exist, create stack
            if (e.message.indexOf('does not exist') > -1) {
              return createStack();
            }

            // Otherwise throw another error
            throw new SError(e.message);
          });
    }


    /**
     * Monitor CF Stack Status (Create/Update)
     * moved from lib/utils/aws/CloudFormation.js
     */

    _monitorCf(cfData, checkFreq) {

      let _this = this,
          stackStatusComplete;

      let validStatuses = ['CREATE_COMPLETE', 'CREATE_IN_PROGRESS', 'UPDATE_COMPLETE', 'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS'];

      return new BbPromise(function(resolve, reject) {

        let stackStatus = null,
            stackData     = null;

        async.whilst(
            function() {
              return (stackStatus !== 'UPDATE_COMPLETE' &&  stackStatus !== 'CREATE_COMPLETE');
            },

            function(callback) {
              setTimeout(function() {

                let params = {
                  StackName: cfData.StackId
                };
                S.getProvider('aws')
                    .request('CloudFormation', 'describeStacks', params, _this.evt.options.stage, _this.evt.options.region)
                    .then(function(data) {

                      stackData   = data;
                      stackStatus = stackData.Stacks[0].StackStatus;

                      SUtils.sDebug('CF stack status: ', stackStatus);

                      if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                        return reject(new SError(`An error occurred while provisioning your cloudformation: ${stackData.Stacks[0].StackStatusReason}`));
                      } else {
                        return callback();
                      }
                    });
              }, checkFreq ? checkFreq : 5000);
            },

            function() {
              return resolve(stackData.Stacks[0]);
            }
        );
      });
    }
  }


  return( ResourcesDeploy );
};
