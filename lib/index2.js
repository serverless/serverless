'use strict';

const path = require('path'),
    utils = require('./utils/index'),
    JawsCLI = require('./utils/cli'),
    JawsError = require('./jaws-error'),
    Promise = require('bluebird'),
    AWSUtils = require('./utils/aws');

/**
 * JAWS Class
 */
let JAWS = class JAWS {

  constructor() {

    let _this = this;

    // Add meta data
    this._interactive = process.stdout.isTTY;
    this._version = require('./../package.json').version;
    this._projectRootPath = utils.findProjectRootPath(process.cwd());

    // If within project, add further meta data
    if (this._projectRootPath) {

      this._projectJson = require(this._projectRootPath + '/jaws.json');

      // Fetch Admin ENV information
      // Don't display dotenv load failures for admin.env if we already have the required environment variables
      let silent = !!process.env.ADMIN_AWS_PROFILE;
      require('dotenv').config({
        silent: silent,
        path: path.join(this._projectRootPath, 'admin.env'),
      });
      this._profile = process.env.ADMIN_AWS_PROFILE;
      this._credentials = AWSUtils.profilesGet(this._profile)[this._profile];
    }

    // Create registry for actions, with defaults
    this.actions = {
      ProjectCreate:                null,
      StageCreate:                  null,
      RegionCreate:                 null,
      ModuleCreate:                 null,
      ModulePostInstall:            null,
      LambdaPackageNodeJs0_10_32:   null,
      LambdaUpload:                 null,
      LambdaProvision:              null,
      ApiGatewayProvision:          null,
      ResourcesProvision:           null,
      EnvList:                      null,
      EnvGet:                       null,
      EnvSet:                       null,
      TagResource:                  null,
      LambdaRun:                    null,
      Dash:                         null,
    };

    // Create registry for hooks
    this.hooks = {
      PreProjectCreate:               [],
      PostProjectCreate:              [],
      PreStageCreate:                 [],
      PostStageCreate:                [],
      PreRegionCreate:                [],
      PostRegionCreate:               [],
      PreModuleCreate:                [],
      PostModuleCreate:               [],
      PreModulePostInstall:           [],
      PostModulePostInstall:          [],
      PreLambdaPackageNodeJs0_10_32:  [],
      PostLambdaPackageNodeJs0_10_32: [],
      PreLambdaUpload:                [],
      PostLambdaUpload:               [],
      PreLambdaProvision:             [],
      PostLambdaProvision:            [],
      PreApiGatewayProvision:         [],
      PostApiGatewayProvision:        [],
      PreResourcesProvision:          [],
      PostResourcesProvision:         [],
      PreEnvList:                     [],
      PostEnvList:                    [],
      PreEnvGet:                      [],
      PostEnvGet:                     [],
      PreEnvSet:                      [],
      PostEnvSet:                     [],
      PreTagResource:                 [],
      PostTagResource:                [],
      PreLambdaRun:                   [],
      PostLambdaRun:                  [],
      PreDash:                        [],
      PostDash:                       [],
    };

    // If within project, check for plugins and add any
    if (this._projectRootPath) {

    //  Check project root
    //  If within aws_module, check module root
    //  If within aws_module/resource, check resource root

    }
  }

  /**
   * Update Config
   * @param config
   */
  config(config) {

    // Extend JAWS with config properties

  }

  /**
   * Set Action
   */
  action(action, actionGenerator) {

    // Check action is valid
    if (!this.actions[action]) {

    }

    this.action = actionGenerator;
  }

  /**
   * Set Hook
   */
  hook(hook, hookGenerator, index) {

    // Check hook is valid
    if (!this.hooks[hook]) {

    }

    index = (!index && index !== 0) ? this.hooks[hook].length : index;
    this.hooks[hook].splice(index, 0, hookGenerator);
  }

  /**
   * Orchestrator
   */
  orchestrate() {

  }
}

module.exports = new JAWS();


