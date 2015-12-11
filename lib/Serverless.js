'use strict';

require('shelljs/global');

const path      = require('path'),
    SUtils      = require('./utils/index'),
    SCli        = require('./utils/cli'),
    SError      = require('./ServerlessError'),
    SAwsMisc    = require('./utils/aws/Misc'),
    BbPromise   = require('bluebird'),
    dotenv      = require('dotenv');

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
    this._projectRootPath   = SUtils.findProjectRootPath(process.cwd());
    this._projectJson       = false;
    this.actions            = {};
    this.hooks              = {};
    this.commands           = {};

    // If within project, add further queued data
    if (this._projectRootPath) {

      this._projectJson = require(this._projectRootPath + '/s-project.json');

      // Load Admin ENV information
      require('dotenv').config({
        silent: true, // Don't display dotenv load failures for admin.env if we already have the required environment variables
        path:   path.join(this._projectRootPath, 'admin.env'),
      });

      // Set Admin API Keys
      this._awsAdminKeyId     = process.env.SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID;
      this._awsAdminSecretKey = process.env.SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY;
    }

    // Load Plugins: Defaults
    let defaults = require('./Actions.json');
    this._loadPlugins(__dirname, defaults.plugins);

    // Load Plugins: Project
    if (this._projectRootPath && this._projectJson.plugins) {
      this._loadPlugins(this._projectRootPath, this._projectJson.plugins);
    }
  }

  /**
   * Validate Project
   * Ensures:
   * - valid SERVERLESS project found
   * - proj s-project.json has one valid region and stage
   */

  validateProject() {
    let _this = this;

    // Check for root path
    if (!this._projectRootPath) {
      return BbPromise.reject(new SError('Must be in a Serverless project', SError.errorCodes.NOT_IN_SERVERLESS_PROJECT));
    }

    // Check for projectJson and stages property
    if (!this._projectJson || !this._projectJson.stages) {
      return BbPromise.reject(new SError(
          'Serverless project must have at least one stage and region defined',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    // Check stages exists
    let stages = Object.keys(_this._projectJson.stages);
    if (!stages || !stages.length) {
      return BbPromise.reject(new SError(
          'Serverless project must have at least one stage and region defined',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    // Check stages have at least one region
    let hasOneRegion = stages.some(function(stageName) {
      return !!_this._projectJson.stages[stageName][0].region;
    });
    if (!hasOneRegion) {
      return BbPromise.reject(new SError(
          'Serverless project must have at least one region defined',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    // Check for AWS API Keys
    if (!this._awsAdminKeyId || !this._awsAdminSecretKey) {
      return BbPromise.reject(new SError(
          'Missing AWS API Keys',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    return BbPromise.resolve();
  }

  /**
   * Command
   * @param argv
   * @returns {Promise}
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
      if (queue.indexOf(action) === -1) queue.push(action); // Prevent duplicate actions from being added
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
   * Register Hook
   * @param hook
   * @param config
   */

  addHook(hook, config) {
    let name = config.action + (config.event.charAt(0).toUpperCase() + config.event.slice(1));
    this.hooks[name].push(hook);
  }

  /**
   * Add Plugin
   * @param ServerlessPlugin class object
   * @returns {Promise}
   */

  addPlugin(ServerlessPlugin) {
    return BbPromise.all([
      ServerlessPlugin.registerActions(),
      ServerlessPlugin.registerHooks(),
    ]);
  }

  /**
   * Execute Pre/Post shell based hook
   * @param fullScriptPath
   * @returns {Promise.<int>} return code
   * @private
   * TODO Re-implement this
   */

  //_executeShellHook(fullScriptPath) {
  //  SCli.log(`Executing shell hook ${fullScriptPath}...`);
  //
  //  try {
  //    let rc = exec(fullScriptPath, {silent: false}).code;
  //    if (rc !== 0) {
  //      return BbPromise.reject(new SError(`ERROR executing shell hook ${fullScriptPath}. RC: ${rc}...`, SError.errorCodes.UNKNOWN));
  //    }
  //  } catch (e) {
  //    console.error(e);
  //    return BbPromise.reject(new SError(`ERROR executing shell hook ${fullScriptPath}. Threw error. RC: ${rc}...`, SError.errorCodes.UNKNOWN));
  //  }
  //
  //  return BbPromise.resolve(rc);
  //}

  /**
   * Load Plugins
   * @param relDir string path to start from when rel paths are specified
   * @param pluginMetadata [{path:'path (re or loadable npm mod',config{}}]
   * @private
   */

  _loadPlugins(relDir, pluginMetadata) {

    let _this = this;

    for (let pluginMetadatum of pluginMetadata) {

      // Find Plugin
      let PluginClass;
      if (pluginMetadatum.path.indexOf('.') == 0) {

        // Load non-npm plugin from the project plugins folder
        let pluginAbsPath = path.join(relDir, pluginMetadatum.path);
        SUtils.sDebug('Attempting to load plugin from ' + pluginAbsPath);
        PluginClass = require(pluginAbsPath);
      } else {

        // Load plugin from either custom or node_modules in plugins folder
        if (SUtils.dirExistsSync(path.join(relDir, 'plugins', 'custom', pluginMetadatum.path))) {
          PluginClass = require(path.join(relDir, 'plugins', 'custom', pluginMetadatum.path));
          PluginClass = PluginClass(__dirname);
        } else if (SUtils.dirExistsSync(path.join(relDir, 'plugins', 'node_modules', pluginMetadatum.path))) {
          PluginClass = require(path.join(relDir, 'plugins', 'node_modules', pluginMetadatum.path));
          PluginClass = PluginClass(__dirname);
        }
      }

      // Load Plugin
      if (!PluginClass) {
        console.log('WARNING: This plugin was requested by this project but could not be found: ' + pluginMetadatum.path);
      } else {
        SUtils.sDebug(PluginClass.getName() + ' plugin loaded');
        this.addPlugin(new PluginClass(_this, pluginMetadatum.config || {}));
      }
    }
  }
}

module.exports = Serverless;
