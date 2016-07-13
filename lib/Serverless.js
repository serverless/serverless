'use strict';

require('shelljs/global');

const path    = require('path'),
    _           = require('lodash'),
    SCli        = require('./utils/cli'),
    SError      = require('./Error'),
    BbPromise   = require('bluebird'),
    dotenv      = require('dotenv');

// Global Bluebird Config
BbPromise.onPossiblyUnhandledRejection(function(error) {
  throw error;
});
BbPromise.longStackTraces();

class Serverless {

  constructor(config) {

    // Add version
    this._version   = require('./../package.json').version;
    this._pipeline  = null;

    // Set Default Config
    this.config = {
      interactive:     false,
      serverlessPath:  __dirname
    };

    this.classes                    = {};
    this.classes.Plugin             = require('./Plugin')(this);
    this.classes.Serializer         = require('./Serializer')(this);
    this.classes.ProviderAws        = require('./ProviderAws')(this);
    this.classes.Project            = require('./Project')(this);
    this.classes.Function           = require('./Function')(this);
    this.classes.Endpoint           = require('./Endpoint')(this);
    this.classes.Event              = require('./Event')(this);
    this.classes.Stage              = require('./Stage')(this);
    this.classes.Region             = require('./Region')(this);
    this.classes.Templates          = require('./Templates')(this);
    this.classes.Variables          = require('./Variables')(this);
    this.classes.Resources          = require('./Resources')(this);
    this.classes.Runtime            = require('./Runtime')(this);
    this.classes.RuntimeNode        = require('./RuntimeNode')(this);
    this.classes.RuntimeNode43      = require('./RuntimeNode43')(this);
    this.classes.RuntimePython27    = require('./RuntimePython27')(this);

    // Add Config Settings
    this.updateConfig(config);

    // Add Defaults
    this.providers          = {};
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};
    this.cli                = null;
    this.utils              = require('./utils/index');
  }

  /**
   * Init
   * - Initializes project
   * - Returns a Promise
   */

  init() {

    let _this = this;

    return BbPromise.try(function() {

          // Load Core & Project Plugins before anything
          _this._loadPlugins(__dirname, require('./Actions.json').plugins);
          if (_this.hasProject()) _this.loadProjectPlugins();

        })
        .then(function() {

          if (_this.hasProject()) {

            // Instantiate Project
            _this._project = new _this.classes.Project();

            // Load Project
            return _this._project.load()
              .then(function() {

                // Load Admin ENV information
                require('dotenv').config({
                  silent: true, // Don't display dotenv load failures for admin.env if we already have the required environment variables
                  path:   path.join(_this.getProject().getRootPath(), 'admin.env')
                });
              })
              .then(function() {
                _this.initProviders();
              });
          } else {
            _this.initProviders();
          }

        });
  }

  updateConfig(config) {
    this.config = _.assign(this.config, config);
  }

  getConfig() {
    return this.config;
  }

  getServerlessPath() {
    let args = _.toArray(arguments);
    args.unshift(this.config.serverlessPath);
    return path.join.apply(this.config.serverlessPath, args);
  }

  /**
   * Project
   */

  hasProject() {
    return this.config.projectPath != undefined;
  }

  getProject() {
    return this._project;
  }

  setProject( project ) {
    this._project = project;
  }

  /**
   * Providers
   */

  initProviders() {
    this.providers.aws = new this.classes.ProviderAws(this.config);
  }

  getProvider() {
    return this.providers.aws;
  }

  hasProvider(name) {
    return this.providers[name.toLowerCase()] != undefined;
  }

  /**
   * Execute
   */

  _execute(actionQueue, evt, config) {

    let _this = this;

    // If no queue, create one
    if (!_this._pipeline) {

      _this._pipeline = BbPromise.try(function() {

            if (_this.cli) {

              // If CLI...

              // Set up evt.options
              evt = {
                options: _.assign(_this.cli.options, _this.cli.params)
              };

            } else {

              // If Programmatic...

              // If no options object, auto-set options
              if (typeof evt.options === 'undefined' && Object.keys(evt).length) evt = { options: evt };

            }
          })
          .then(function() {

            return actionQueue.reduce(function (previous, current) {
              return previous.then(current);
            }, BbPromise.resolve(_this.middleware(evt, config)));

          })
          .catch(SError, function(e) {
            _this._reset();
            throw e;
            process.exit(e.messageId);
          })
          .error(function(e) {
            console.error(e);
            _this._reset();
            process.exit(1);
          })
          .finally(function() {
            _this._reset();
          });

      return _this._pipeline;

    } else {

      // Otherwise, return promises in existing queue

      return actionQueue.reduce(function (previous, current) {
        return previous.then(current);
      }, BbPromise.resolve(_this.middleware(evt, config)));
    }
  }

  /**
   * Middleware
   */

  middleware(evt, config) {

    // Always have properties
    if (!evt.options) evt.options = {};
    if (!evt.data)    evt.data    = {};

    return evt;
  }

  /**
   * Reset
   */

  _reset() {
    this._pipeline = null;
  }

  /**
   * Load Project Plugins
   */

  loadProjectPlugins() {

    // Get s-project.json
    let projectJson = require(path.join(this.config.projectPath, 's-project.json'));
    this._loadPlugins(this.config.projectPath, projectJson.plugins || []);

  }

  /**
   * Load Plugins
   * - @param relDir string path to start from when rel paths are specified
   * - @param pluginMetadata [{path:'path (re or loadable npm mod',config{}}]
   */

  _loadPlugins(relDir, pluginsArray) {

    let _this = this;

    // Loads plugin and throws error if not found
    let loadPlugin = function(pluginPath) {
      let p;
      try {
        p = require(pluginPath);
      } catch(e) {
        throw new SError(`Error loading this plugin: ${pluginPath}
        ${e.message}`);
      }
      return p
    };

    // Load plugins in provided array
    for (let pluginMetadatum of pluginsArray) {

      // Find Plugin
      let PluginClass;
      if (pluginMetadatum.indexOf('.') > -1 ) {

        // Load non-npm plugin from the private plugins folder
        let pluginAbsPath = path.join(relDir, pluginMetadatum);
        _this.utils.sDebug('Attempting to load plugin from ' + pluginAbsPath);
        PluginClass = loadPlugin(pluginAbsPath);
        PluginClass = PluginClass(_this);

      } else {

        // Load plugin from either plugins or node_modules folder
        if (_this.utils.dirExistsSync(path.join(relDir, 'node_modules', pluginMetadatum))) {
          let pluginPath = path.join(relDir, 'node_modules', pluginMetadatum);
          _this.utils.sDebug('Attempting to load plugin from ' + pluginPath);
          PluginClass = loadPlugin(pluginPath);
          PluginClass = PluginClass(_this);
        } else if (_this.utils.dirExistsSync(path.join(relDir, 'plugins', pluginMetadatum))) {
          let pluginPath = path.join(relDir, 'plugins', pluginMetadatum);
          _this.utils.sDebug('Attempting to load plugin from ' + pluginPath);
          PluginClass = loadPlugin(pluginPath);
          PluginClass = PluginClass(_this);
        } else {
          throw new SError(`This plugin could not be found: ${pluginMetadatum}`);
        }
      }

      // Load Plugin
      if (PluginClass) {
        _this.utils.sDebug(PluginClass.getName() + ' plugin loaded');
        this.addPlugin(new PluginClass());
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
      context: null,
      action:  null,
      options: {},
      params:  {},
      raw:     argv
    };

    // If debug option, set to debug mode
    if (_this.cli.raw && _this.cli.raw.d) process.env.DEBUG = true;

    _this.utils.sDebug('CLI raw input: ', _this.cli.raw);

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
      return BbPromise.reject(new SError('Command not found.  Enter "serverless help" to see all available commands.'));
    }
    if (!_this.commands[_this.cli.context][_this.cli.action]) {
      return BbPromise.reject(new SError('In the command you just typed, the "' + _this.cli.context + '" is valid but "' + _this.cli.action + '" is not.  Enter "serverless help" to see the actions for this context.'));
    }

    // if not in project root and not creating project, throw error
    if (!this.hasProject() && _this.cli.context != 'project') {
      return BbPromise.reject(new SError('This command can only be run inside a Serverless project.'));
    }

    // Get Command Config
    let cmdConfig = _this.commands[_this.cli.context][_this.cli.action];

    // Options - parse using command config
    cmdConfig.options.map(opt => {
      _this.cli.options[opt.option]
        = (! _.isNil(_this.cli.raw[opt.option])) ? _this.cli.raw[opt.option]
        : (! _.isNil(_this.cli.raw[opt.shortcut])) ? _this.cli.raw[opt.shortcut]
        : null;
    });

    // Params - remove context and contextAction strings from params array
    let params = _this.cli.raw._.filter(v => {
      return ([cmdConfig.context, cmdConfig.contextAction].indexOf(v) == -1);
    });

    // Params - parse params using command config
    if (cmdConfig.parameters) {
      cmdConfig.parameters.forEach(function(parameter) {
        if (parameter.position.indexOf('->') == -1) {
          _this.cli.params[parameter.parameter] = params.splice(parameter.position, parameter.position + 1);
          _this.cli.params[parameter.parameter] = _this.cli.params[parameter.parameter][0];
        } else {
          _this.cli.params[parameter.parameter] = params.splice(parameter.position.split('->')[0], (parameter.position.split('->')[1] ? parameter.position.split('->')[1] : params.length));
        }
      });
    }

    _this.utils.sDebug('CLI processed input: ', _this.cli);

    _this.actions[cmdConfig.handler].apply(_this, {});
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
    config.options    = config.options    || [];
    config.parameters = config.parameters || [];

    // Add Action
    this.actions[config.handler] = function(evt) {

      // Add pre hooks, action, then post hooks to queued
      let queue = _this.hooks[config.handler + 'Pre'];

      // Prevent duplicate actions from being added
      if (queue.indexOf(action) === -1) queue.push(action);

      // Use _execute()
      return _this._execute(queue.concat(_this.hooks[config.handler + 'Post']), evt, config);
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
   * Get Runtime
   */

  getRuntime(runtimeName) {
    let _this = this;
    for (let key in _this.classes) {
      if (key.indexOf('Runtime') !== -1 && _this.classes[key].getName() == runtimeName) {
        return new _this.classes[key];
      }
    }
  }

  /**
   * Get All Runtimes
   */

  getAllRuntimes() {
    return _.filter(this.classes, (cls, name) => name.startsWith('Runtime') && cls.getName())
      .map(cls => cls.getName());
  }

}

module.exports = Serverless;
