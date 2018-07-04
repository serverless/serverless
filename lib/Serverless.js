'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const os = require('os');
const updateNotifier = require('update-notifier');
const platform = require('@serverless/platform-sdk');
const pkg = require('../package.json');
const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const Variables = require('./classes/Variables');
const ServerlessError = require('./classes/Error').ServerlessError;
const Version = require('./../package.json').version;
const configUtils = require('./utils/config');

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};

    this.providers = {};

    this.version = Version;

    this.yamlParser = new YamlParser(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.variables = new Variables(this);
    this.pluginManager = new PluginManager(this);

    // use the servicePath from the options or try to find it in the CWD
    configObject.servicePath = configObject.servicePath || this.utils.findServicePath();

    this.config = new Config(this, configObject);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Variables = Variables;
    this.classes.Error = ServerlessError;
    this.classes.PluginManager = PluginManager;

    this.serverlessDirPath = path.join(os.homedir(), '.serverless');
  }

  init() {
    // create a new CLI instance
    this.cli = new this.classes.CLI(this);

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options);
    this.pluginManager.setCliCommands(this.processedInput.commands);

    // Check if update is available
    updateNotifier({ pkg }).notify();

    return this.service.load(this.processedInput.options)
      .then(() => {
        // load all plugins
        this.pluginManager.loadAllPlugins(this.service.plugins);

        // give the CLI the plugins and commands so that it can print out
        // information such as options when the user enters --help
        this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
        this.cli.setLoadedCommands(this.pluginManager.getCommands());
        return this.pluginManager.updateAutocompleteCacheFile();
      });
  }

  run() {
    const config = configUtils.getConfig();
    const currentId = config.userId;
    const globalConfig = configUtils.getGlobalConfig();

    let isTokenExpired = false;
    if (globalConfig
      && globalConfig.users
      && globalConfig.users[currentId]
      && globalConfig.users[currentId].auth
      && globalConfig.users[currentId].auth.id_token
      && !globalConfig.users[currentId].dashboard) {
      isTokenExpired = true;
    }

    if (isTokenExpired && !this.processedInput.commands[0] === 'login') {
      this.cli
        .log('WARNING: Your login token has expired. Please run "serverless login" to login.');
    }

    this.utils.logStat(this).catch(() => BbPromise.resolve());

    if (this.cli.displayHelp(this.processedInput)) {
      return BbPromise.resolve();
    }

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    // populate variables after --help, otherwise help may fail to print
    // (https://github.com/serverless/serverless/issues/2041)
    return this.variables.populateService(this.pluginManager.cliOptions).then(() => {
      if ((!this.processedInput.commands.includes('deploy') &&
        !this.processedInput.commands.includes('remove')) || !this.config.servicePath) {
        return BbPromise.resolve();
      }

      let username = null;
      let idToken = null;
      if (globalConfig
        && globalConfig.users
        && globalConfig.users[currentId]
        && globalConfig.users[currentId].dashboard
        && globalConfig.users[currentId].dashboard.username
        && globalConfig.users[currentId].dashboard.idToken) {
        username = globalConfig.users[currentId].dashboard.username;
        idToken = globalConfig.users[currentId].dashboard.idToken;
      }
      if (!username || !idToken) {
        return BbPromise.resolve();
      }

      if (!this.service.tenant && !this.service.app) {
        this.cli.log('WARNING: Missing "tenant" and "app" properties in serverless.yml. Without these properties, you can not publish the service to the Serverless Platform.'); // eslint-disable-line
        return BbPromise.resolve();
      } else if (this.service.tenant && !this.service.app) {
        const errorMessage = ['Missing "app" property in serverless.yml'].join('');
        throw new this.classes.Error(errorMessage);
      } else if (!this.service.tenant && this.service.app) {
        const errorMessage = ['Missing "tenant" property in serverless.yml'].join('');
        throw new this.classes.Error(errorMessage);
      }

      return platform.listTenants({ idToken, username }).then((tenants) => {
        const tenantsList = tenants.map(tenant => tenant.tenantName);
        if (!tenantsList.includes(this.service.tenant)) {
          const errorMessage = [`tenant "${this.service
            .tenant}" does not exist.`].join('');
          throw new this.classes.Error(errorMessage);
        }
      });
    }).then(() => {
      // merge arrays after variables have been populated
      // (https://github.com/serverless/serverless/issues/3511)
      this.service.mergeArrays();

      // populate function names after variables are loaded in case functions were externalized
      // (https://github.com/serverless/serverless/issues/2997)
      this.service.setFunctionNames(this.processedInput.options);

      // validate the service configuration, now that variables are loaded
      this.service.validate();

      // trigger the plugin lifecycle when there's something which should be processed
      return this.pluginManager.run(this.processedInput.commands);
    });
  }

  setProvider(name, provider) {
    this.providers[name] = provider;
  }

  getProvider(name) {
    return this.providers[name] ? this.providers[name] : false;
  }

  getVersion() {
    return this.version;
  }
}

module.exports = Serverless;
