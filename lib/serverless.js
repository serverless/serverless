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
    this._interactive       = (config.interactive !== undefined) ? config.interactive : process.stdout.isTTY;
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
      let silent = !!process.env.SERVERLESS_ADMIN_AWS_PROFILE;
      require('dotenv').config({
        silent: silent, // Don't display dotenv load failures for admin.env if we already have the required environment variables
        path:   path.join(this._projectRootPath, 'admin.env'),
      });

      this._awsProfile = process.env.SERVERLESS_ADMIN_AWS_PROFILE;
      if (!this._awsAdminKeyId)     this._awsAdminKeyId     = SAwsMisc.profilesGet(this._awsProfile)[this._awsProfile].aws_access_key_id;
      if (!this._awsAdminSecretKey) this._awsAdminSecretKey = SAwsMisc.profilesGet(this._awsProfile)[this._awsProfile].aws_secret_access_key;
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
   * - proj serverless.json has one valid region and stage
   */

  validateProject() {
    let _this = this;

    if (!this._projectRootPath) {
      return BbPromise.reject(new SError('Must be in a Serverless project', SError.errorCodes.NOT_IN_SERVERLESS_PROJECT));
    }

    if (!this._projectJson || !_this._projectJson.stages) {
      return BbPromise.reject(new SError(
          'Serverless project must have at least one stage and region defined',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    let stages = Object.keys(_this._projectJson.stages);
    if (!stages || !stages.length) {
      return BbPromise.reject(new SError(
          'Serverless project must have at least one stage and region defined',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    let hasOneRegion = stages.some(function(stageName) {
      return !!_this._projectJson.stages[stageName][0].region;
    });

    if (!hasOneRegion) {
      return BbPromise.reject(new SError(
          'Serverless project must have at least one region defined',
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

    SUtils.sDebug('command argv', argv);

    // Handle version command
    if (argv.version) {
      console.log(this._version);
      return BbPromise.resolve();
    }

    let cmdContext       = argv._[0],
        cmdContextAction = argv._[1];

    this.cli = {};  //options and args that the command was called with on the CLI so plugins can leverage

    if (argv.help || argv.h) {
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
      let PluginClass;

      if (pluginMetadatum.path.indexOf('.') == 0) { //rel path
        let pluginAbsPath = path.join(relDir, pluginMetadatum.path);
        SUtils.sDebug('Attempting to load plugin from ' + pluginAbsPath);
        PluginClass = require(pluginAbsPath);
      } else {  //abs path or node module
        PluginClass = require(pluginMetadatum.path);
      }

      SUtils.sDebug(PluginClass.getName() + ' plugin loaded');

      this.addPlugin(new PluginClass(_this, pluginMetadatum.config || {}));
    }
  }
}

module.exports = Serverless;
