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

  constructor(project, config) {

    // Add version
    this._version   = require('./../package.json').version;
    this._pipeline  = null;

    // Set Default Config
    this.config = {
      interactive:     false,
      serverlessPath:  __dirname
    };

    this.classes = {
      // TODO: add Stage, Region
      ProviderAws:  require('./ServerlessProviderAws'),
      State:        require('./ServerlessState'),
      Meta:         require('./ServerlessMeta'),
      Project:      require('./ServerlessProject'),
      Component:    require('./ServerlessComponent'),
      Function:     require('./ServerlessFunction'),
      Endpoint:     require('./ServerlessEndpoint'),
      Event:        require('./ServerlessEvent')
    };

    this.setProject( project );

    // Add Config Settings
    this.updateConfig(config);

    // Add Defaults
    this._providers         = {};
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};
    this.cli                = null;
    this.state              = new this.classes.State(this); // temporarily re-added to increase stability

    if (this.hasProject()) {
      // Load Admin ENV information
      require('dotenv').config({
        silent: true, // Don't display dotenv load failures for admin.env if we already have the required environment variables
        path:   path.join(this.getProject().getRootPath(), 'admin.env')
      });
    }

    this.initProviders();

    // Load Plugins: Framework Defaults
    let defaults = require('./Actions.json');
    this._loadPlugins(__dirname, defaults.plugins);
    this.loadProjectPlugins();
  }

  getProject() {
    return this._project;
  }

  hasProject() {
    return this._project != undefined;
  }

  setProject( project ) {
    if( _.isString( project ) ){
      project = this.classes.Project.findProject( project );
    }

    this._project = project;

    if( project != undefined ){
      // TODO: get rid of this? Seems like responsibility of Serverless and Project classes is too tangled together
      project.setServerless( this );
    }
  }

  /**
   * Init
   * - Initializes state
   * - Returns a Promise
   */

  init() {
    return this.getProject().load();
  }
  // TODO: Remove Backward Compatibility. Many CI/CD systems are using _init() still.
  _init() {
    return this.getProject().load();
  }

  /**
   * Providers
   */

  initProviders() {
    this._providers.aws = new this.classes.ProviderAws(this.config);
  }

  getProvider(name) {
    return this._providers[name.toLowerCase()];
  }

  hasProvider(name) {
    return this._providers[name.toLowerCase()] != undefined;
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
              options: extend(_this.cli.options, _this.cli.params)
            };

            if (_this.hasProject()) return _this.init();

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
   * Get Serverless Global Config
   */

  getConfig() {
    return this.config;
  }

  /**
   * Update Serverless Global Config
   */

  updateConfig(config) {
    this.config = extend(this.config, config);
  }

  /**
   * Load Project Plugins
   */

  loadProjectPlugins() {
    if( this.hasProject() ) {
      this._loadPlugins( this.getProject().getRootPath(), this.getProject().getPlugins() );
    }
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
      if (pluginMetadatum.indexOf('.') > -1 ) {

        // Load non-npm plugin from the private plugins folder
        let pluginAbsPath = path.join(relDir, pluginMetadatum);
        SUtils.sDebug('Attempting to load plugin from ' + pluginAbsPath);
        PluginClass = require(pluginAbsPath);
        PluginClass = PluginClass(SPlugin, __dirname);

      } else {

        // Load plugin from either plugins or node_modules folder
        if (SUtils.dirExistsSync(path.join(relDir, 'node_modules', pluginMetadatum))) {
          PluginClass = require(path.join(relDir, 'node_modules', pluginMetadatum));
          PluginClass = PluginClass(SPlugin, __dirname);
        }
      }

      // Load Plugin
      if (PluginClass) {
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
      return BbPromise.reject(new SError('In the command you just typed, the "' + _this.cli.context + '" is valid but "' + _this.cli.action + '" is not.  Enter "serverless help" to see the actions for this context.'));
    }
    if (!_this.commands[_this.cli.context][_this.cli.action]) {
      return BbPromise.reject(new SError('Command not found.  Enter "serverless help" to see all available commands.'));
    }

    // if not in project root and not creating project, throw error
    if (!this.hasProject() && _this.cli.context != 'project') {
      return BbPromise.reject(new SError('This command can only be run inside a Serverless project.'));
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

    SUtils.sDebug('CLI processed input: ', _this.cli);

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
}

module.exports = Serverless;
