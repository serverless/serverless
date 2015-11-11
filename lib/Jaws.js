'use strict';

require('shelljs/global');
const path      = require('path'),
      JawsUtils = require('./utils/index'),
      JawsCLI   = require('./utils/cli'),
      JawsError = require('./jaws-error'),
      AWSUtils  = require('./utils/aws'),
      dotenv    = require('dotenv'),
      Promise   = require('bluebird');

Promise.onPossiblyUnhandledRejection(function(error) {
  throw error;
});
Promise.longStackTraces();

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
    this.calledCommand      = {  //options and args that the command was called with on the CLI so plugins can leverage
      context:       null,
      contextAction: null,
      opts:          [],
      params:        [],
      rawArgv:       {},
    };

    // If within project, add further meta data
    if (this._projectRootPath) {

      this._projectJson = require(this._projectRootPath + '/jaws.json');

      // Load Admin ENV information
      // Don't display dotenv load failures for admin.env if we already have the required environment variables
      let silent = !!process.env.JAWS_ADMIN_AWS_PROFILE;
      require('dotenv').config({
        silent: silent,
        path:   path.join(this._projectRootPath, 'admin.env'),
      });
      this._awsProfile  = process.env.JAWS_ADMIN_AWS_PROFILE;
      this._credentials = AWSUtils.profilesGet(this._awsProfile)[this._awsProfile];
    }

    // Load plugins: defaults
    let defaults = require('./defaults/defaults.json');
    this._loadPlugins(__dirname, defaults.plugins);

    // If running within a JAWS project, load any project specific plugins (if any)
    if (this._projectRootPath && this._projectJson.plugins) {
      this._loadPlugins(this._projectRootPath, this._projectJson.plugins);
    }
  }

  /**
   * Validate Project
   * Ensures:
   * - valid JAWS project found
   * - proj jaws.json has one valid region and stage
   *
   * @returns {Promise} true if validates
   */

  validateProject() {
    let _this = this;

    if (!this._projectRootPath) {
      return Promise.reject(new JawsError('Must be in a JAWS project', JawsError.errorCodes.NOT_IN_JAWS_PROJECT));
    }

    if (!this._projectJson || !_this._projectJson.stages) {
      return Promise.reject(new JawsError(
        'JAWS project must have at least one stage and region defined',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    let stages = Object.keys(_this._projectJson.stages);
    if (!stages || !stages.length) {
      return Promise.reject(new JawsError(
        'JAWS project must have at least one stage and region defined',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    let hasOneRegion = stages.some(function(stageName) {
      return !!_this._projectJson.stages[stageName][0].region;
    });

    if (!hasOneRegion) {
      return Promise.reject(new JawsError(
        'JAWS project must have at least one region defined',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    return Promise.resolve();
  }

  /**
   * Get env file for region and stage
   * @param region
   * @param stage
   * @returns {Promise}
   */

  getEnvFile(region, stage) {
    let bucket = this.getJawsBucket(region, stage);

    JawsCLI.log(`Getting ENV file from S3 bucket: ${bucket} in ${region}`);
    return AWSUtils.getEnvFile(
      this._awsProfile,
      region,
      bucket,
      this._projectJson.name,
      stage);
  }

  /**
   * Get JawsBucket
   * @param region
   * @param stage
   * @returns {Promise} string jaws bucket
   */
  getJawsBucket(region, stage) {
    let projConfig = JawsUtils.getProjRegionConfigForStage(this._projectJson, stage, region);
    return projConfig.jawsBucket;
  }

  /**
   * Register action
   * @param action must return an ES6 Promise that is resolved or rejected
   * @param config
   */

  action(action, config) {

    let _this = this;

    // Add Hooks Array
    this.hooks[config.handler + 'Pre']  = [];
    this.hooks[config.handler + 'Post'] = [];

    // Add Action
    this.actions[config.handler] = function() {
      // Custom action function necessary to pass args through
      let args     = arguments;
      let actionFn = function() {
        return action.apply(_this, args);
      };

      // Add pre hooks, action, then post hooks to queue
      let queue = _this.hooks[config.handler + 'Pre'];
      queue.push(actionFn);
      queue = queue.concat(_this.hooks[config.handler + 'Post']);
      return _this._executeQueue(queue);
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
    let _this = this;

    return Promise.try(() => {
        return queue;
      })
      .each(function(p) {
        //For every handler, we allow Pre and Post hooks via env vars for those use cases where
        //writing a Jaws nodejs plugin is not wanted
        let shellHook = `JAWS_HOOK_${p}`;
        if (!process.env[shellHook]) {
          return p();
        } else {
          JawsUtils.jawsDebug(`Env var hook ${shellHook} not empty, executing`);
          return _this._executeShellHook(process.env[shellHook]);
        }
      });
  }

  /**
   * Execute Pre/Post shell based hook
   *
   * @param fullScriptPath
   * @returns {Promise.<int>} return code
   * @private
   */
  _executeShellHook(fullScriptPath) {
    JawsCLI.log(`Executing shell hook ${fullScriptPath}...`);

    try {
      let rc = exec(fullScriptPath, {silent: false}).code;
      if (rc !== 0) {
        return Promise.reject(new JawsError(`ERROR executing shell hook ${fullScriptPath}. RC: ${rc}...`, JawsError.errorCodes.UNKNOWN));
      }
    } catch (e) {
      console.error(e);
      return Promise.reject(new JawsError(`ERROR executing shell hook ${fullScriptPath}. Threw error. RC: ${rc}...`, JawsError.errorCodes.UNKNOWN));
    }

    return Promise.resolve(rc);
  }

  /**
   *
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
        JawsUtils.jawsDebug('Attempting to load plugin from ' + pluginAbsPath);
        PluginClass = require(pluginAbsPath);
      } else {  //abs path or node module
        PluginClass = require(pluginMetadatum.path);
      }

      JawsUtils.jawsDebug(PluginClass.getName() + ' plugin loaded. Adding...');

      this.addPlugin(new PluginClass(_this, pluginMetadatum.config || {}));
    }
  }

  /**
   * Command
   * @param argv
   * @returns {Promise}
   */

  command(argv) {
    JawsUtils.jawsDebug('command argv', argv);

    // Handle version command
    if (argv.version) {
      console.log(this._version);
      return Promise.resolve();
    }

    let cmdContext       = argv._[0],
        cmdContextAction = argv._[1];

    if (argv.help || argv.h) {
      if (!this.commands[cmdContext]) {
        return JawsCLI.generateMainHelp(this.commands);
      } else if (this.commands[cmdContext] && !this.commands[cmdContext][cmdContextAction]) {
        return JawsCLI.generateContextHelp(cmdContext, this.commands);
      }

      // If context AND contextAction passed with help need the cmdConfig (below)
    } else if (!this.commands[cmdContext] || !this.commands[cmdContext][cmdContextAction]) {
      return Promise.reject(new JawsError('Command Not Found', JawsError.errorCodes.UNKNOWN));
    }

    let cmdConfig  = this.commands[cmdContext][cmdContextAction],
        opts       = cmdConfig.options.map(opt => {
          return (argv[opt.option] ? argv[opt.option] : (argv[opt.shortcut] || null));
        }),
        nonOptArgs = argv._.filter(v => {
          // Remove context and contextAction strings from non opt args
          return ([cmdConfig.context, cmdConfig.contextAction].indexOf(v) == -1);
        });

    JawsUtils.jawsDebug('opts', opts);
    JawsUtils.jawsDebug('argv._', argv._);
    JawsUtils.jawsDebug('non opt args', nonOptArgs);

    if (argv.help || argv.h) {
      return JawsCLI.generateActionHelp(cmdConfig);
    }

    this.calledCommand.context       = cmdConfig.context;
    this.calledCommand.contextAction = cmdConfig.contextAction;
    this.calledCommand.opts          = cmdConfig.opts;
    this.calledCommand.args          = cmdConfig.nonOptArgs;
    this.calledCommand.rawArgv       = argv;

    // Call Action with all defined options AND args that are not options
    //TODO: how do we verify required args are passed?
    opts = opts.concat(nonOptArgs);
    return this.actions[cmdConfig.handler].apply(this, opts);
  }
}

module.exports = Jaws;