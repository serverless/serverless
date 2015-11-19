'use strict';

/**
 * Action: Code Provision: Lambda: Nodejs
 * - Collects and optimizes Lambda code in a temp folder
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    extend       = require('util')._extend,
    BbPromise    = require('bluebird'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class CodeProvisionLambdaNodejs extends JawsPlugin {

  /**
   * Constructor
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'jaws.core.' + CodeProvisionLambdaNodejs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.codeProvisionLambdaNodejs.bind(this), {
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
    _this.evt = evt;

    // Load AWS Service Instances
    let awsConfig = {
      region:          _this.evt.region.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.Lambda          = require('../../utils/aws/Lambda')(awsConfig);
    _this.CloudFormation  = require('../../utils/aws/Lambda')(awsConfig);
    _this.S3              = require('../../utils/aws/S3')(awsConfig);
    _this.AwsMisc         = require('../../utils/aws/Misc');

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(function() {
          return _this.evt;
        })
        .catch(function(e) {
          console.log(e.stack)
        });
  }

  /**
   * Validate And Prepare
   * - If CLI, maps CLI input to event object
   */

  _validateAndPrepare() {
    BbPromise.resolve();
  }

  /**
   * Generate lambda-cf.json file
   * - Always put in entries for lambdas marked as queued
   * - If no existing lambda CF, just generate entries for lambdas intended for deployment
   * - If existing lambda CF, find all awsm.json's in current project, and put in ones that are already in
   * - existing lambda-cf.json. Making sure to use the existing CF obj for the lambda to not trigger an update
   * @returns {Promise} true if there was an existing stack, false if not
   * @private
   */

  _generateLambdaCf() {

    let _this         = this,
        existingStack = true;

    let params = {
      StackName: _this.CloudFormation.sGetLambdasStackName(
          _this.evt.stage,
          _this.Jaws._projectJson.name) /* required */
    };

    _this.CloudFormation.getTemplatePromised(params)
        .then(function(data) {
          return data.TemplateBody;
        })
        .error(e => {

          // ValidationError if does not exist
          if (e && ['ValidationError', 'ResourceNotFoundException'].indexOf(e.code) == -1) {
            console.error(
                'Error trying to fetch existing lambda cf stack for region',
                _this.evt.region,
                'stage',
                _this.evt.stage,
                e
            );
            throw new JawsError(e.message);
          }

          JawsUtils.jawsDebug('no existing lambda stack');
          existingStack = false;

          return false;
        })
        .then(cfTemplateBody => {

          let templatesPath = path.join(__dirname, '..', '..', 'templates'),
              lambdaCf      = JawsUtils.readAndParseJsonSync(
                  path.join(templatesPath, 'lambdas-cf.json')
              );

          delete lambdaCf.Resources.lTemplate;

          lambdaCf.Description                        = projName + ' lambdas';
          lambdaCf.Parameters.aaLambdaRoleArn.Default = lambdaRoleArn;

          // Always add lambdas tagged for deployment
          awsmLambdasToDeploy.forEach(pkg => {
            let lambdaAwsmJson = JawsUtils.readAndParseJsonSync(pkg.awsmPath),
                lambdaName     = pkg.lambdaName;

            Object.keys(lambdaAwsmJson.cloudFormation.lambda).forEach(cfEleIdx => {
              let cfEle = lambdaAwsmJson.cloudFormation.lambda[cfEleIdx];

              //If its not a lambda CF resource, prefix it with the lambda name to prevent collisions
              let resourceIdx = (cfEle.Type == 'AWS::Lambda::Function') ? lambdaName : lambdaName + '-' + cfEleIdx;

              cfEle.Properties.Code           = pkg.Code;
              lambdaCf.Resources[resourceIdx] = cfEle;

              JawsUtils.jawsDebug(`adding Resource ${resourceIdx}`, cfEle);
            });
          });

          // If existing lambdas CF template
          if (cfTemplateBody) {
            JawsUtils.jawsDebug('existing stack detected');

            // Find all lambdas in project, and copy ones that are in existing lambda-cf
            let existingTemplate = JSON.parse(cfTemplateBody);

            return JawsUtils.getAllLambdaNames(_this._JAWS._projectRootPath)
                .then(allLambdaNames => {
                  Object.keys(existingTemplate.Resources).forEach(resource => {

                    if (!lambdaCf.Resources[resource] && allLambdaNames.indexOf(resource) != -1) {
                      JawsUtils.jawsDebug(`Adding exsiting lambda ${resource}`);
                      lambdaCf.Resources[resource] = existingTemplate.Resources[resource];
                    }
                  });

                  return lambdaCf;
                });
          } else {
            return lambdaCf;
          }
        })
        .then(lambdaCfTemplate => {
          let lambdasCfPath = path.join(
              _this._JAWS._projectRootPath,
              'cloudformation',
              'lambdas-cf.json'
          );

          JawsUtils.jawsDebug(`Wrting to ${lambdasCfPath}`);

          return JawsUtils.writeFile(lambdasCfPath, JSON.stringify(lambdaCfTemplate, null, 2))
              .then(() => existingStack);
        });

  }
}

module.exports = CodeProvisionLambdaNodejs;