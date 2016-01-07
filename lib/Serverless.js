'use strict';

require('shelljs/global');

const path    = require('path'),
  _           = require('lodash'),
  SUtils      = require('./utils/index'),
  SCli        = require('./utils/cli'),
  SError      = require('./ServerlessError'),
  SPlugin     = require('./ServerlessPlugin'),
  BbPromise   = require('bluebird'),
  dotenv      = require('dotenv'),
  extend      = require('util')._extend;

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

    // Add version
    this._version           = require('./../package.json').version;

    // Set Default Config
    this.config = {
      interactive:       false,
      awsAdminKeyId:     null,
      awsAdminSecretKey: null,
      projectPath:       null
    };

    // Add Config Settings
    this.updateConfig(config);

    // Add Defaults
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};
    this.classes            = {
      Meta:     require('./ServerlessMeta'),
      Project:  require('./ServerlessProject'),
      Module:   require('./ServerlessModule'),
      Function: require('./ServerlessFunction')
    };
    this.cli                = null;

    // If project
    if (this.config.projectPath) {

      // Load Admin ENV information
      require('dotenv').config({
        silent: true, // Don't display dotenv load failures for admin.env if we already have the required environment variables
        path:   path.join(this.config.projectPath, 'admin.env')
      });

      // Set Admin API Keys
      this.config.awsAdminKeyId     = process.env.SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID || this.config.awsAdminKeyId;
      this.config.awsAdminSecretKey = process.env.SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY || this.config.awsAdminSecretKey;
    }

    // Load Plugins: Framework Defaults
    let defaults = require('./Actions.json');
    this._loadPlugins(__dirname, defaults.plugins);

    // Load Plugins: Project
    if (this.config.projectPath && SUtils.fileExistsSync(path.join(this.config.projectPath, 's-project.json'))) {
      let projectJson = require(path.join(this.config.projectPath, 's-project.json'));
      if (projectJson.plugins) this._loadPlugins(this.config.projectPath, projectJson.plugins);
    }
  }

  /**
   * Update Serverless Global Config
   */

  updateConfig(config) {
    this.config = extend(this.config, config);
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

    let _this = this;

    // Set CLI
    _this.cli = {
      set:     false,
      context: null,
      action:  null,
      options: {},
      params:  {},
      raw:     argv
    };

    // If debug option, set to debug mode
    if (_this.cli.raw && _this.cli.raw.d) process.env.DEBUG = true;

    SUtils.sDebug('CLI raw input: ', _this.cli.raw);

    // If version command, return version
    if (_this.cli.raw._[0] === 'version' || _this.cli.raw._[0] === 'v' | argv.v===true || argv.version===true)  {
      console.log(_this._version);
      return BbPromise.resolve();
    }

    // Get Context & Action
    _this.cli.context = _this.cli.raw._[0];
    _this.cli.action  = _this.cli.raw._[1];

    // Show Help - if no context action, "help" or "h" is specified as params or options
    if (_this.cli.raw._.length === 0 ||
      _this.cli.raw._[0] === 'help' ||
      _this.cli.raw._[0] === 'h' ||
      _this.cli.raw.help ||
      _this.cli.raw.h)
    {
      if (!_this.commands[_this.cli.context]) {
        return SCli.generateMainHelp(_this.commands);
      } else if (_this.commands[_this.cli.context] && !_this.commands[_this.cli.context][_this.cli.action]) {
        return SCli.generateContextHelp(_this.cli.context, _this.commands);
      } else if (_this.commands[_this.cli.context] && _this.commands[_this.cli.context][_this.cli.action]) {
        return SCli.generateActionHelp(_this.commands[_this.cli.context][_this.cli.action]);
      }
    }

    // If command not found, throw error
    if (!_this.commands[_this.cli.context]) {
      return BbPromise.reject(new SError('The "' + _this.cli.context + '" is valid but "' + _this.cli.action + '" is not.  Enter "serverless help" to see the actions for this context.'));
    }
    if (!_this.commands[_this.cli.context][_this.cli.action]) {
      return BbPromise.reject(new SError('Command not found.  Enter "serverless help" to see all available commands.'));
    }

    // Get Command Config
    let cmdConfig = _this.commands[_this.cli.context][_this.cli.action];

    // Options - parse using command config
    cmdConfig.options.map(opt => {
      _this.cli.options[opt.option] = (_this.cli.raw[opt.option] ? _this.cli.raw[opt.option] : (_this.cli.raw[opt.shortcut] || null));
    });

    // Params - remove context and contextAction strings from params array
    let params = _this.cli.raw._.filter(v => {
      return ([cmdConfig.context, cmdConfig.contextAction].indexOf(v) == -1);
    });

    // Params - parse params using command config
    if(cmdConfig.parameters) {
      cmdConfig.parameters.forEach(function(parameter) {
        if (parameter.position.indexOf('->') == -1) {
          _this.cli.params[parameter.parameter] = params.splice(parameter.position, parameter.position + 1);
          _this.cli.params[parameter.parameter] = _this.cli.parameters[parameter.parameter][0];
        } else {
          _this.cli.params[parameter.parameter] = params.splice(parameter.position.split('->')[0], (parameter.position.split('->')[1] ? parameter.position.split('->')[1] : params.length));
        }
      });
    }

    SUtils.sDebug('CLI processed input: ', _this.cli);

    return _this.actions[cmdConfig.handler].apply(_this, {});
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

    // Handle optional configuration
    config.options    = config.options || [];
    config.parameters = config.parameters || [];

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
      }, BbPromise.resolve(_this.middleware(evt, config)));

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
      ServerlessPlugin.registerHooks()
    ]);
  }

  /**
   * Middleware
   */

  middleware(evt, config) {

    let _this  = this;
    evt        = evt || {};
    let newEvt =  _.cloneDeep(evt);

    // If CLI and first Action, prepare evt object
    if (_this.cli && !_this.cli.set) {
      newEvt = {
        options:  extend(_this.cli.options, _this.cli.params)
      };
      _this.cli.set = true;
    }

    // If not CLI and no options object, auto-set options
    if (!_this.cli && typeof newEvt.options === 'undefined') {
      newEvt = { options: newEvt };
    }

    // Always have properties
    if (!newEvt.options) newEvt.options = {};
    if (!newEvt.data) newEvt.data       = {};

    return newEvt;
  }
}

module.exports = Serverless;
