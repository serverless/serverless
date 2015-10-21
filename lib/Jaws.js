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
    this._interactive   = (config.interactive !== undefined) ? config.interactive : process.stdout.isTTY;
    this._awsAdminKeyId = config.awsAdminKeyId; //TODO: I think we should remove this
    this._awsAdminSecretKey = config.awsAdminSecretKey;//TODO: I think we should remove this
    this._version         = require('./../package.json').version;
    this._projectRootPath = JawsUtils.findProjectRootPath(process.cwd());
    this._projectJson     = false;
    this.actions          = {};
    this.hooks            = {};
    this.commands         = {};

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
      this._profile     = process.env.JAWS_ADMIN_AWS_PROFILE;
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
    let defaults = require('./defaults/defaults.json');
    this._loadPlugins(__dirname, defaults.plugins);

    // If running within a JAWS project, load any project specific plugins (if any)
    if (this._projectRootPath && this._projectJson.plugins) {
      this._loadPlugins(this._projectRootPath, this._projectJson.plugins);
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
   * @param relDir string path to start from when rel paths are specified
   * @param pluginMetadata [{path:'path (re or loadable npm mod',config{}}]
   * @private
   */
  _loadPlugins(relDir, pluginMetadata) {

    let _this = this;

    for (let pluginMetadatum of pluginMetadata) {
      let pluginClass;

      if (pluginMetadatum.path.indexOf('.') == 0) { //rel path
        let pluginAbsPath = path.join(relDir, pluginMetadatum.path);
        JawsUtils.jawsDebug('Attempting to load plugin from ' + pluginAbsPath);
        pluginClass = require(pluginAbsPath);
      } else {  //abs path or node module
        pluginClass = require(pluginMetadatum.path);
      }

      JawsUtils.jawsDebug(pluginClass.getName() + ' plugin loaded. Adding...');

      this.addPlugin(new pluginClass(_this, pluginMetadatum.config || {}));
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
      return (argv[opt.option] ? argv[opt.option] : (argv[opt.shortcut] || null));
    });

    //Remove context and contextAction strings from non opt args
    let nonOptArgs = argv._.filter(v=> {
      return ([cmdConfig.context, cmdConfig.contextAction].indexOf(v) == -1);
    });

    JawsUtils.jawsDebug('opts', opts);
    JawsUtils.jawsDebug('argv._', argv._);
    JawsUtils.jawsDebug('non opt args', nonOptArgs);

    // Call Action with all defined options AND args that are not options
    //TODO: how do we verify required args are passed?
    opts = opts.concat(nonOptArgs);

    return this.actions[cmdConfig.handler].apply(this, opts);
  }
}

module.exports = Jaws;