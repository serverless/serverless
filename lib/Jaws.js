'use strict';

const path      = require('path'),
    JawsUtils   = require('./utils/index'),
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
    _this.hooks[config.handler + 'Pre']   = [];
    _this.hooks[config.handler + 'Post']  = [];

    // Add Action handler
    if (config && config.handler) {
      _this[config.handler] = function() {

        // Custom action function necessary to pass args through
        let args = arguments;
        let actionFn = function() {
          return _this.actions[config.handler].apply(_this, args);
        };

        // Add to queue
        let queue = [];
        queue = queue.concat(_this.hooks[config.handler + 'Pre']);
        queue.push(actionFn);
        queue = queue.concat(_this.hooks[config.handler + 'Post']);
        return _this._executeQueue(queue);

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

  _executeQueue(queue) {
    return Promise.try(function() {
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
   * Load Plugins
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
   * Command
   */

  command(argv) {

    // Check if command context and action are defined
    if (!this.commands[argv._[0]] || !this.commands[argv._[0]][argv._[1]]) {
      return console.log('Command Not Found');
    }

    let cmdConfig = this.commands[argv._[0]][argv._[1]];
    let opts      = cmdConfig.options;

    // Call Action with up to 12 params
    return this[cmdConfig.handler](
        (opts[0] ? (argv[opts[0].option] ? argv[opts[0].option] : (argv[opts[0].shortcut] ? argv[opts[0].shortcut] : null)) : null),
        (opts[1] ? (argv[opts[1].option] ? argv[opts[1].option] : (argv[opts[1].shortcut] ? argv[opts[1].shortcut] : null)) : null),
        (opts[2] ? (argv[opts[2].option] ? argv[opts[2].option] : (argv[opts[2].shortcut] ? argv[opts[2].shortcut] : null)) : null),
        (opts[3] ? (argv[opts[3].option] ? argv[opts[3].option] : (argv[opts[3].shortcut] ? argv[opts[3].shortcut] : null)) : null),
        (opts[4] ? (argv[opts[4].option] ? argv[opts[4].option] : (argv[opts[4].shortcut] ? argv[opts[4].shortcut] : null)) : null),
        (opts[5] ? (argv[opts[5].option] ? argv[opts[5].option] : (argv[opts[5].shortcut] ? argv[opts[5].shortcut] : null)) : null),
        (opts[6] ? (argv[opts[6].option] ? argv[opts[6].option] : (argv[opts[6].shortcut] ? argv[opts[6].shortcut] : null)) : null),
        (opts[7] ? (argv[opts[7].option] ? argv[opts[7].option] : (argv[opts[7].shortcut] ? argv[opts[7].shortcut] : null)) : null),
        (opts[8] ? (argv[opts[8].option] ? argv[opts[8].option] : (argv[opts[8].shortcut] ? argv[opts[8].shortcut] : null)) : null),
        (opts[9] ? (argv[opts[9].option] ? argv[opts[9].option] : (argv[opts[9].shortcut] ? argv[opts[9].shortcut] : null)) : null),
        (opts[10] ? (argv[opts[10].option] ? argv[opts[10].option] : (argv[opts[10].shortcut] ? argv[opts[10].shortcut] : null)) : null),
        (opts[11] ? (argv[opts[11].option] ? argv[opts[11].option] : (argv[opts[11].shortcut] ? argv[opts[11].shortcut] : null)) : null),
        (opts[12] ? (argv[opts[12].option] ? argv[opts[12].option] : (argv[opts[12].shortcut] ? argv[opts[12].shortcut] : null)) : null)
    );
  }
}

module.exports = Jaws;