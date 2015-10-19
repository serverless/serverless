'use strict';

const path      = require('path'),
    utils       = require('./utils/index'),
    JawsCLI     = require('./utils/cli'),
    JawsError   = require('./jaws-error'),
    Promise     = require('bluebird'),
    AWSUtils    = require('./utils/aws');

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
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};

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
    //PreProjectCreate:        [],
    //PostProjectCreate:       [],
    //PreStageCreate:          [],
    //PostStageCreate:         [],
    //PreRegionCreate:         [],
    //PostRegionCreate:        [],
    //PreModuleCreate:         [],
    //PostModuleCreate:        [],
    //PreModulePostInstall:    [],
    //PostModulePostInstall:   [],
    //PreLambdaPackage:        [],
    //PostLambdaPackage:       [],
    //PreLambdaUpload:         [],
    //PostLambdaUpload:        [],
    //PreLambdaProvision:      [],
    //PostLambdaProvision:     [],
    //PreApiGatewayProvision:  [],
    //PostApiGatewayProvision: [],
    //PreResourcesProvision:   [],
    //PostResourcesProvision:  [],
    //PreEnvList:              [],
    //PostEnvList:             [],
    //PreEnvGet:               [],
    //PostEnvGet:              [],
    //PreEnvSet:               [],
    //PostEnvSet:              [],
    //PreTagResource:          [],
    //PostTagResource:         [],
    //PreLambdaRun:            [],
    //PostLambdaRun:           [],
    //PreDash:                 [],
    //PostDash:                [],

    // Load plugins: defaults
    //var defaults = require('./defaults/defaults.json');
    //this._loadPlugins(defaults);

    // Load plugins: project
    if (this._projectRootPath) {
      this._loadPlugins(this._projectJson.plugins);
    }

    // Set commands
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
   * Register Action
   */

  action(action, config) {

    let _this = this;

    // Add Action
    _this.actions[config.handler] = action;

    // Add Hooks Array
    _this.hooks[config.handler + 'Pre'] = [];
    _this.hooks[config.handler + 'Post'] = [];

    // Add Action handler
    if (config && config.handler) {
      _this[config.handler] = function() {

        // Add to queue
        _this._queue = _this._queue.concat(_this.hooks[config.handler + 'Pre']);
        _this._queue.push(_this.actions[config.handler].bind(_this, arguments));
        _this._queue = _this._queue.concat(_this.hooks[config.handler + 'Post']);
        return _this._executeQueue();

      }
    }

    // Add command
    if (config.context && config.contextAction) {
      if (!_this.commands[config.context]) _this.commands[config.context] = {};
      _this.commands[config.context][config.contextAction] = config;
    }
  }

  /**
   * Register Hook
   */

  hook(hook, config) {

    // Check hook is for valid action
    if (!this.actions[config.handler]) {

    }

    let name = config.handler + (config.event.charAt(0).toUpperCase() + config.event.slice(1));
    this.hooks[name].push(hook);
  }

  /**
   * Add Plugin
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
   * Execute Queue
   */

  _executeQueue() {
    let _this = this;

    return Promise.try(function() {
          return _this._queue;
        })
        .each(function(p) {
          return p();
        })
        .catch(function(error) {
          throw new JawsError(error);
        });
  }

  /**
   * Load Plugins
   */

  _loadPlugins(plugins) {

    for (let i = 0; i < plugins.length; i++) {
      let plugin = plugins[i];

      if (plugin.path) {
        require(plugin.path);
      } else {

      }
    }
  }

  /**
   * Command
   */

  command(argv) {

    // Check if command context is defined
    if (!this.commands[argv[0]] || !this.commands[argv[1]]) {
      return console.log('Command Not Found');
    }

    let cmdConfig = this[this.commands[argv[0]][argv[1]]];
    let optKeys   = cmdConfig.cli.options;

    return cmdConfig.handler(
        argv[optKeys[0]],
        argv[optKeys[1]],
        argv[optKeys[2]],
        argv[optKeys[3]],
        argv[optKeys[4]],
        argv[optKeys[5]],
        argv[optKeys[6]],
        argv[optKeys[7]],
        argv[optKeys[8]],
        argv[optKeys[9]],
        argv[optKeys[10]],
        argv[optKeys[11]],
        argv[optKeys[12]]
    );
  }
}

module.exports = Jaws;