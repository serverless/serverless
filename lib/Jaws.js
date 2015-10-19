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
    var defaults = utils.readAndParseJsonSync(path.join(__dirname, './defaults/defaults.json'));
    this._loadPlugins(defaults.plugins);

    // Load plugins: project
    if (this._projectRootPath && this._projectJson.plugins) {
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
        _this._queue = _this._queue.concat(_this.hooks[config.handler + 'Pre']);
        _this._queue.push(actionFn);
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