'use strict';

/**
 * Action: Code Provision: Lambda: Nodejs
 * - Collects and optimizes Lambda code in a temp folder
 * - Don't attach "evt" to context, it will be overwritten in concurrent operations
 */

const SPlugin    = require('../ServerlessPlugin'),
    SError       = require('../ServerlessError'),
    SUtils       = require('../utils/index'),
    SCli         = require('../utils/cli'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class CodeProvisionLambdaNodejs extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'serverless.core.' + CodeProvisionLambdaNodejs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.S.addAction(this.codeProvisionLambdaNodejs.bind(this), {
      handler:       'codeProvisionLambdaNodejs',
      description:   'Deploys the code or endpoint of a function, or both'
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  codeProvisionLambdaNodejs(evt) {
    let _this = this;

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };
    _this.CloudFormation  = require('../utils/aws/CloudFormation')(awsConfig);
    _this.AwsMisc         = require('../utils/aws/Misc');

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._generateLambdaCf)
        .then(_this._provision)
        .then(function() {
          return evt;
        })
        .catch(function(e) {
          console.log(e.stack)
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {
    return BbPromise.resolve(evt);
  }

  /**
   * Generate lambda-cf.json file
   * - Always put in entries for lambdas marked as queued
   * - If no existing lambda CF, just generate entries for lambdas intended for deployment
   * - If existing lambda CF, find all s-function.json's in current project, and put in ones that are already in
   * - existing lambda-cf.json. Making sure to use the existing CF obj for the lambda to not trigger an update
   * @returns {Promise} true if there was an existing stack, false if not
   * @private
   */

  _generateLambdaCf(evt) {

    let _this         = this;
    evt.stackExists   = true;

    // Fetch Lambdas CF Stack
    let params = {
      StackName: _this.CloudFormation.sGetLambdasStackName(
          evt.stage,
          _this.S._projectJson.name) /* required */
    };

    return _this.CloudFormation.getTemplatePromised(params)
        .then(function(data) {
          return data.TemplateBody;
        })
        .error(e => {

          // ValidationError if does not exist
          if (e && ['ValidationError', 'ResourceNotFoundException'].indexOf(e.code) == -1) {
            console.error(
                'Error trying to fetch existing lambda cf stack for region',
                evt.region,
                'stage',
                evt.stage,
                e
            );
            throw new SError(e.message);
          }

          SUtils.sDebug('no existing lambda stack');
          evt.stackExists = false;

          return false;
        })
        .then(deployedCfTemplate => {

          // Recreate new CloudFormation Template
          let templatesPath = path.join(__dirname, '..', '..', 'templates'),
              projectCfTemplate      = SUtils.readAndParseJsonSync(
                  path.join(templatesPath, 'lambdas-cf.json')
              );

          delete projectCfTemplate.Resources.lTemplate;

          projectCfTemplate.Description                        = _this.S._projectJson.name + ' lambda resources';
          projectCfTemplate.Parameters.aaLambdaRoleArn.Default = evt.region.iamRoleArnLambda;

          // Always add lambdas tagged for deployment
          evt.functions.forEach(func => {

            Object.keys(func.cloudFormation.lambda).forEach(resourceKey => {

              // Get cloudformation.lambda resource (Functions, EventSourceMapping, AccessPolicyX)
              let resourceJson = func.cloudFormation.lambda[resourceKey];

              // If its not a "Function" CF resource, prefix it with the function name to prevent collisions
              resourceKey = (resourceJson.Type == 'AWS::Lambda::Function') ? func.name : func.name + '-' + resourceKey;

              // Add to project CF template
              projectCfTemplate.Resources[resourceKey] = resourceJson;

              SUtils.sDebug(`Adding Resource ${resourceKey}`);

            });
          });

          // If existing lambdas CF template
          if (deployedCfTemplate) {

            SUtils.sDebug('Existing lambdas CloudFormation stack detected for: ', params.StackName);

            deployedCfTemplate = JSON.parse(deployedCfTemplate);

            // Find all lambdas in project, and copy ones that are in deployed template
            return SUtils.getFunctions(_this.S._projectRootPath)
                .then(allFunctions => {

                  let allCfResources = [];

                  // Loop through all functions
                  for (let i = 0; i < allFunctions.length; i++) {

                    // Add Lambda CF Resources
                    if (allFunctions[i].cloudFormation && allFunctions[i].cloudFormation.lambda) {

                      let lambda = allFunctions[i].cloudFormation.lambda;

                      // Loop through each CF resource for this Lambda and add them to the allCfResources array
                      for (let resource in lambda) {

                        if (!resource.Type) continue;

                        // Prefix Function Name
                        if (['AWS::Lambda::EventSourceMapping',
                              'AWS::Lambda::Permission'].indexOf(lambda[resource].Type) !== -1) {
                          allCfResources.push(allFunctions[i].name + resource);
                        } else {
                          allCfResources.push(resource);
                        }
                      }
                    }
                  }

                  // Loop through deployed CF template resource keys
                  Object.keys(deployedCfTemplate.Resources).forEach(deployedResource => {

                    // If resource key does not exist in project Cf Template
                    if (!projectCfTemplate.Resources[deployedResource]
                        && allCfResources.indexOf(deployedResource) != -1) {
                      SUtils.sDebug(`Adding existing lambda ${deployedResource}`);
                      projectCfTemplate.Resources[resource] = deployedCfTemplate.Resources[deployedResource];
                    }
                  });

                  return projectCfTemplate;
                });
          } else {
            return projectCfTemplate;
          }
        })
        .then(projectCfTemplate => {

          let lambdasCfPath = path.join(
              _this.S._projectRootPath,
              'cloudformation',
              'lambdas-cf.json'
          );

          SUtils.sDebug(`Writing to ${lambdasCfPath}`);

          evt.projectCfTemplate = projectCfTemplate;

          return SUtils.writeFile(
              lambdasCfPath,
              JSON.stringify(evt.projectCfTemplate, null, 2)
              )
              .then(() => {
                return evt;
              });
        });

  }

  _provision(evt) {

    let _this = this,
        createOrUpdate,
        cfDeferred;


    SUtils.sDebug(`Lambda stack exists (${evt.stackExists}), deploying with ARN: ${evt.region.iamRoleArnLambda}`);

    if (evt.stackExists) {
      cfDeferred     = _this.CloudFormation.sUpdateLambdasStack(
          _this.S,
          evt.stage,
          evt.region.region);
      createOrUpdate = 'update';
    } else {
      cfDeferred     = _this.CloudFormation.sCreateLambdasStack(
          _this.S,
          evt.stage,
          evt.region.region);
      createOrUpdate = 'create';
    }

    SCli.log('Running CloudFormation lambda deploy...');

    let spinner = SCli.spinner();
    spinner.start();

    return cfDeferred
        .then(function(cfData) {
          return _this.CloudFormation.sMonitorCf(cfData, createOrUpdate);
        })
        .then(function() {
          spinner.stop(true);
        });
  }
}

module.exports = CodeProvisionLambdaNodejs;
