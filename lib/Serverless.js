'use strict';

require('shelljs/global');

const path      = require('path'),
    SUtils      = require('./utils/index'),
    SCli        = require('./utils/cli'),
    SError      = require('./ServerlessError'),
    SPlugin     = require('./ServerlessPlugin'),
    BbPromise   = require('bluebird'),
    dotenv      = require('dotenv');

// Global Bluebird Config
BbPromise.onPossiblyUnhandledRejection(function(error) {
  throw error;
});
BbPromise.longStackTraces();

/**
 * Serverless Base Class
 */

class Serverless {

  constructor(config) {

    config = config ? config : {};

    // Add Defaults
    this._interactive       = (config.interactive !== undefined) ? config.interactive : (process.stdout.isTTY && !process.env.CI);
    this._awsAdminKeyId     = config.awsAdminKeyId;
    this._awsAdminSecretKey = config.awsAdminSecretKey;
    this._version           = require('./../package.json').version;
    this._projectRootPath   = SUtils.getProjectPath(process.cwd());
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};
    this.classes            = {
      Project: require('./ServerlessProject'),
      Module:  require('./ServerlessModule'),
    };

    // If project
    if (this._projectRootPath) {

      // Load Admin ENV information
      require('dotenv').config({
        silent: true, // Don't display dotenv load failures for admin.env if we already have the required environment variables
        path:   path.join(this._projectRootPath, 'admin.env'),
      });

      // Set Admin API Keys
      this._awsAdminKeyId     = process.env.SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID;
      this._awsAdminSecretKey = process.env.SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY;
    }

    // Load Plugins: Framework Defaults
    let defaults = require('./Actions.json');
    this._loadPlugins(__dirname, defaults.plugins);

    // Load Plugins: Project
    if (this._projectRootPath && SUtils.fileExistsSync(path.join(this._projectRootPath, 's-project.json'))) {
      let projectJson = require(path.join(this._projectRootPath, 's-project.json'));
      if (projectJson.plugins) this._loadPlugins(this._projectRootPath, projectJson.plugins);
    }

    let prj = new this.classes.Project(this, {});
    console.log(prj.get());
  }

  /**
   * Load Plugins
   * - @param relDir string path to start from when rel paths are specified
   * - @param pluginMetadata [{path:'path (re or loadable npm mod',config{}}]
   */

  _loadPlugins(relDir, pluginMetadata) {

    let _this = this;

    for (let pluginMetadatum of pluginMetadata) {

      // Find Plugin
      let PluginClass;
      if (pluginMetadatum.path.indexOf('.') == 0) {

        // Load non-npm plugin from the private plugins folder
        let pluginAbsPath = path.join(relDir, pluginMetadatum.path);
        SUtils.sDebug('Attempting to load plugin from ' + pluginAbsPath);
        PluginClass = require(pluginAbsPath);
        PluginClass = PluginClass(SPlugin, __dirname);
      } else {

        // Load plugin from either custom or node_modules in plugins folder
        if (SUtils.dirExistsSync(path.join(relDir, 'plugins', 'custom', pluginMetadatum.path))) {
          PluginClass = require(path.join(relDir, 'plugins', 'custom', pluginMetadatum.path));
          PluginClass = PluginClass(SPlugin, __dirname);
        } else if (SUtils.dirExistsSync(path.join(relDir, 'plugins', 'node_modules', pluginMetadatum.path))) {
          PluginClass = require(path.join(relDir, 'plugins', 'node_modules', pluginMetadatum.path));
          PluginClass = PluginClass(SPlugin, __dirname);
        }
      }

      // Load Plugin
      if (!PluginClass) {
        console.log('WARNING: This plugin was requested by this project but could not be found: ' + pluginMetadatum.path);
      } else {
        SUtils.sDebug(PluginClass.getName() + ' plugin loaded');
        this.addPlugin(new PluginClass(_this));
      }
    }
  }

  /**
   * Command
   */

  command(argv) {

    // Set Debug to True
    if (argv && argv.d) process.env.DEBUG = true;

    SUtils.sDebug('Command raw argv: ', argv);

    // Handle version command
    if (argv._[0] === 'version') {
      console.log(this._version);
      return BbPromise.resolve();
    }

    let cmdContext       = argv._[0],
        cmdContextAction = argv._[1];

    this.cli = {};  // Options and args that the command was called with on the CLI so plugins can leverage

    if (argv._.length === 0 || argv._[0] === 'help' || argv._[0] === 'h') {
      if (!this.commands[cmdContext]) {
        return SCli.generateMainHelp(this.commands);
      } else if (this.commands[cmdContext] && !this.commands[cmdContext][cmdContextAction]) {
        return SCli.generateContextHelp(cmdContext, this.commands);
      }

      // If context AND contextAction passed with help need the cmdConfig (below)
    } else if (!this.commands[cmdContext] || !this.commands[cmdContext][cmdContextAction]) {
      return BbPromise.reject(new SError('Command Not Found', SError.errorCodes.UNKNOWN));
    }

    let cmdConfig  = this.commands[cmdContext][cmdContextAction],
        opts       = {},
        params     = argv._.filter(v => {
          // Remove context and contextAction strings from non opt args
          return ([cmdConfig.context, cmdConfig.contextAction].indexOf(v) == -1);
        });

    cmdConfig.options.map(opt => {
      opts[opt.option] = (argv[opt.option] ? argv[opt.option] : (argv[opt.shortcut] || null));
    });

    SUtils.sDebug('opts', opts);
    SUtils.sDebug('argv._', argv._);
    SUtils.sDebug('non opt args', params);

    if (argv.help || argv.h) {
      return SCli.generateActionHelp(cmdConfig);
    }

    this.cli.context       = cmdConfig.context;
    this.cli.contextAction = cmdConfig.contextAction;
    this.cli.options       = opts;
    this.cli.params        = params;
    this.cli.rawArgv       = argv;

    return this.actions[cmdConfig.handler].apply(this, {});
  }

  /**
   * Add action
   * @param action must return an ES6 BbPromise that is resolved or rejected
   * @param config
   */

  addAction(action, config) {

    let _this = this;

    // Add Hooks Array
    this.hooks[config.handler + 'Pre']  = [];
    this.hooks[config.handler + 'Post'] = [];

    // Add Action
    this.actions[config.handler] = function(evt) {

      // Add pre hooks, action, then post hooks to queued
      let queue = _this.hooks[config.handler + 'Pre'];

      // Prevent duplicate actions from being added
      if (queue.indexOf(action) === -1) queue.push(action);

      queue = queue.concat(_this.hooks[config.handler + 'Post']);

      // Create promise chain
      let chain = queue.reduce(function (previous, current) {
        return previous.then(current);
      }, BbPromise.resolve(evt));

      return chain;
    };

    // Add command
    if (config.context && config.contextAction) {
      if (!this.commands[config.context]) {
        this.commands[config.context] = {};
      }

      this.commands[config.context][config.contextAction] = config;
    }
  }

  /**
   * Add Hook
   */

  addHook(hook, config) {
    let name = config.action + (config.event.charAt(0).toUpperCase() + config.event.slice(1));
    this.hooks[name].push(hook);
  }

  /**
   * Add Plugin
   */

  addPlugin(ServerlessPlugin) {
    return BbPromise.all([
      ServerlessPlugin.registerActions(),
      ServerlessPlugin.registerHooks(),
    ]);
  }
}

module.exports = Serverless;