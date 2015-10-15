'use strict';

const path      = require('path'),
      utils     = require('./utils/index'),
      JawsCLI   = require('./utils/cli'),
      JawsError = require('./jaws-error'),
      Promise   = require('bluebird'),
      AWSUtils  = require('./utils/aws');

/**
 * Jaws base Class
 */

class Jaws {

  constructor(config) {

    let _this = this;
    config    = config ? config : {};

    // Add Defaults
    this._interactive       = (config.interactive !== undefined) ? config.interactive : process.stdout.isTTY;
    this._awsAdminKeyId     = config.awsAdminKeyId;
    this._awsAdminSecretKey = config.awsAdminSecretKey;
    this._version           = require('./../package.json').version;
    this._projectRootPath   = utils.findProjectRootPath(process.cwd());
    this._projectJson       = false;
    this._queue             = [];

    // If within project, add further meta data
    if (this._projectRootPath) {

      this._projectJson = require(this._projectRootPath + '/jaws.json');

      // Load Plugins
      this._loadPlugins(this._projectJson.plugins);

      // Load Admin ENV information
      // Don't display dotenv load failures for admin.env if we already have the required environment variables
      let silent = !!process.env.ADMIN_AWS_PROFILE;
      require('dotenv').config({
        silent: silent,
        path:   path.join(this._projectRootPath, 'admin.env'),
      });
      this._profile     = process.env.ADMIN_AWS_PROFILE;
      this._credentials = AWSUtils.profilesGet(this._profile)[this._profile];
    }

    // Create registry for actions, with defaults
    this.actions      = {};
    let ProjectCreate = require('./defaults/actions/ProjectCreate');
    this.addPlugin(new ProjectCreate(this, {}));

    //{
    //  ProjectCreate:       null,
    //  StageCreate:         null,
    //  RegionCreate:        null,
    //  ModuleCreate:        null,
    //  ModulePostInstall:   null,
    //  LambdaPackage:       null,
    //  LambdaUpload:        null,
    //  LambdaProvision:     null,
    //  LambdaDeploy:        null,
    //  ApiGatewayProvision: null,
    //  ResourcesProvision:  null,
    //  EnvList:             null,
    //  EnvGet:              null,
    //  EnvSet:              null,
    //  TagResource:         null,
    //  LambdaRun:           null,
    //  Dash:                null,
    //};

    // Create registry for hooks
    this.hooks = {
      PreProjectCreate:        [],
      PostProjectCreate:       [],
      PreStageCreate:          [],
      PostStageCreate:         [],
      PreRegionCreate:         [],
      PostRegionCreate:        [],
      PreModuleCreate:         [],
      PostModuleCreate:        [],
      PreModulePostInstall:    [],
      PostModulePostInstall:   [],
      PreLambdaPackage:        [],
      PostLambdaPackage:       [],
      PreLambdaUpload:         [],
      PostLambdaUpload:        [],
      PreLambdaProvision:      [],
      PostLambdaProvision:     [],
      PreApiGatewayProvision:  [],
      PostApiGatewayProvision: [],
      PreResourcesProvision:   [],
      PostResourcesProvision:  [],
      PreEnvList:              [],
      PostEnvList:             [],
      PreEnvGet:               [],
      PostEnvGet:              [],
      PreEnvSet:               [],
      PostEnvSet:              [],
      PreTagResource:          [],
      PostTagResource:         [],
      PreLambdaRun:            [],
      PostLambdaRun:           [],
      PreDash:                 [],
      PostDash:                [],
    };

    // If within project, load plugins
    if (this._projectRootPath) {
      this._loadPlugins(this._projectJson.plugins);
    }
  }

  /**
   * Update Config
   * @param config
   */

  config(config) {

    // Update JAWS with config properties

    // Load Plugins
    if (config.plugins) {
      this._loadPlugins(config.plugins);
    }

  }

  /**
   * Set Action
   */

  action(actionName, actionGenerator) {

    // Check action is valid
    if (!this.actions[actionName]) {

    }

    this.actions[actionName] = actionGenerator;
  }

  /**
   * Set Hook
   */

  hook(hookName, hookGenerator, index) {

    // Check hook is valid
    if (!this.hooks[hookName]) {

    }

    index = (!index && index !== 0) ? this.hooks[hookName].length : index;
    this.hooks[hookName].splice(index, 0, hookGenerator);
  }


  /**
   *
   * @param JawsPlugin class object
   * @returns {Promise}
   */
  addPlugin(JawsPlugin) {
    return Promise.all([
      JawsPlugin.registerActions(),
      JawsPlugin.registerHooks(),
    ]);
  }

  /**
   * Project Create
   * @returns {*}
   */
  projectCreate(options) {

    // Prepare & Execute Queue
    this._queue = this._queue.concat(this.hooks.PreProjectCreate);
    this._queue.push(this.actions.ProjectCreate.bind({}, options));
    this._queue = this._queue.concat(this.hooks.PostProjectCreate);
    this._executeQueue();
    return Promise.resolve();
  }

  /**
   * Execute Queue
   * - Recursive function
   * - Leverages Promise.coroutine to:
   * -- iterate yields in a generator
   * -- wait for yielded promises to resolve (necessary for async)
   * -- push data back to generator
   */

  _executeQueue() {
    let _this = this;

    return Promise.coroutine(_this._queue[0])()
      .then(function() {
        _this._queue.splice(0, 1);  //todo: change to .shift()
        if (_this._queue.length) return _this._executeQueue();
        return;
      })
      .catch(function(error) {
        console.log('JAWS Plugin Error: ', error, error.stack);
        return;
      });
  }

  /**
   * Load Plugins
   */

  _loadPlugins(plugins) {

    let pluginArray = Object.keys(plugins);

    for (let i in pluginArray) {
      pluginArray[i](plugins[pluginArray[i]]).bind(this);
    }
  }
}

module.exports = Jaws;