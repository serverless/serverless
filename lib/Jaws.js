'use strict';

const path      = require('path'),
      JawsUtils = require('./utils/index'),
      JawsCLI   = require('./utils/cli'),
      JawsError = require('./jaws-error'),
      AWSUtils  = require('./utils/aws'),
      Promise   = require('bluebird');

/**
 * Jaws base Class
 */

class Jaws {

  constructor(config) {

    config = config ? config : {};

    // Add Defaults
    this._interactive       = (config.interactive !== undefined) ? config.interactive : process.stdout.isTTY;
    this._awsAdminKeyId     = config.awsAdminKeyId;
    this._awsAdminSecretKey = config.awsAdminSecretKey;
    this._version           = require('./../package.json').version;
    this._projectRootPath   = JawsUtils.findProjectRootPath(process.cwd());
    this._projectJson       = false;
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};

    // If within project, add further meta data
    if (this._projectRootPath) {

      this._projectJson = require(this._projectRootPath + '/jaws.json');

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

    // TODO: Remove these eventually, keeping them for reference...
    //{
    //  ProjectCreate:       null,
    //  StageCreate:         null,
    //  RegionCreate:        null,
    //  ModuleCreate:        null,
    //  ModulePostInstall:   null,
    //  TagResource:         null,
    //  LambdaPackage:       null,
    //  LambdaUpload:        null,
    //  LambdaProvision:     null,
    //  LambdaDeploy:        null,
    //  ApiGatewayProvision: null,
    //  ResourcesProvision:  null,
    //  ResourcesDiff:       null,
    //  ResourcesCopy:       null,
    //  EnvList:             null,
    //  EnvGet:              null,
    //  EnvSet:              null,
    //  LambdaRun:           null,
    //  Dash:                null,
    //};

    // Load plugins: defaults
    var defaults = JawsUtils.readAndParseJsonSync(path.join(__dirname, './defaults/defaults.json'));
    this._loadPlugins(defaults.plugins);

    // Load plugins: project
    if (this._projectRootPath && this._projectJson.plugins) {
      this._loadPlugins(this._projectJson.plugins);
    }

    // Load plugins: aws-module

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
   * Register action
   *
   * @param action must return an ES6 Promise that is resolved or rejected
   * @param config
   */
  action(action, config) {

    let _this = this;

    // Add Action
    this.actions[config.handler] = action;

    // Add Hooks Array
    this.hooks[config.handler + 'Pre']  = [];
    this.hooks[config.handler + 'Post'] = [];

    // Add Action handler
    if (config && config.handler) { //TODO: why this check? in the add action above config.handler MUST be defined...
      this[config.handler] = function() {

        // Custom action function necessary to pass args through
        let args     = arguments;
        let actionFn = function() {
          return _this.actions[config.handler].apply(_this, args);
        };

        // Add to queue
        let queue = [];
        queue     = queue.concat(_this.hooks[config.handler + 'Pre']);
        queue.push(actionFn);
        queue = queue.concat(_this.hooks[config.handler + 'Post']);
        return _this._executeQueue(queue);

      }
    }

    // Add command
    if (config.context && config.contextAction) {
      if (!this.commands[config.context]) {
        this.commands[config.context] = {};
      }
      this.commands[config.context][config.contextAction] = config;
    }
  }

  /**
   *
   * @param hook
   * @param config
   */
  hook(hook, config) {
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
   *
   * @param queue
   * @returns {Promise}
   * @private
   */
  _executeQueue(queue) {
    return Promise.try(() => {
        return queue;
      })
      .each(function(p) {
        return p();
      })
      .catch(function(error) {
        throw new JawsError(error);
      });
  }


  /**
   *
   * @param plugins
   * @private
   */
  _loadPlugins(plugins) {

    let _this = this;

    for (let i = 0; i < plugins.length; i++) {
      let plugin = plugins[i];

      if (plugin.path) {
        // Load from path
        plugin = require(path.join(__dirname, plugin.path));
        _this.addPlugin(new plugin(_this, plugin.config ? plugin.config : null));
      } else {

        // Load from npm module

      }
    }
  }

  /**
   *
   * @param argv
   * @returns {Promise}
   */
  command(argv) {

    // Check if command context and action are defined
    if (!this.commands[argv._[0]] || !this.commands[argv._[0]][argv._[1]]) {
      return Promise.reject(new JawsError('Command Not Found', JawsError.errorCodes.UNKNOWN));
    }

    let cmdConfig = this.commands[argv._[0]][argv._[1]];
    let opts      = cmdConfig.options.map(function(opt) {
      return (argv[opt.option] ? argv[opt.option] : (argv[opt.shortcut] ? argv[opt.shortcut] : null));
    });

    // Call Action with all defined parameters
    return this[cmdConfig.handler].apply(this, opts);
  }
}

module.exports = Jaws;