// TODO: Remove in v3

'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fsp = require('fs').promises;
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const yaml = require('js-yaml');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const { legacy, log, progress, style } = require('@serverless/utils/log');
const ServerlessError = require('../../serverless-error');
const cliCommandsSchema = require('../../cli/commands-schema');
const yamlAstParser = require('../../utils/yamlAstParser');
const fileExists = require('../../utils/fs/fileExists');
const pluginUtils = require('./lib/utils');
const npmCommandDeferred = require('../../utils/npm-command-deferred');

const mainProgress = progress.get('main');

const requestManualUpdate = (serverlessFilePath) => {
  legacy.log(`
  Can't automatically add plugin into "${path.basename(serverlessFilePath)}" file.
  Please make it manually.
`);
  log.notice();
  log.notice.skip(
    `Can't automatically add plugin into "${path.basename(
      serverlessFilePath
    )}" file. Please add it manually.`
  );
};

class PluginInstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(this, pluginUtils);

    this.commands = {
      plugin: {
        commands: {
          install: {
            ...cliCommandsSchema.get('plugin install'),
          },
        },
      },
    };
    this.hooks = {
      'plugin:install:install': async () => BbPromise.bind(this).then(this.install),
    };
  }

  async install() {
    const pluginInfo = pluginUtils.getPluginInfo(this.options.name);
    this.options.pluginName = pluginInfo[0];
    this.options.pluginVersion = pluginInfo[1] || 'latest';

    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then((plugins) => {
        const plugin = plugins.find((item) => item.name === this.options.pluginName);
        if (!plugin) {
          legacy.log('Plugin not found in serverless registry, continuing to install');
        }
        return BbPromise.bind(this)
          .then(this.pluginInstall)
          .then(this.addPluginToServerlessFile)
          .then(this.installPeerDependencies)
          .then(() => {
            const message = [
              'Successfully installed',
              ` "${this.options.pluginName}@${this.options.pluginVersion}"`,
            ].join('');
            legacy.log(message);
            log.notice();
            log.notice.success(
              `Plugin "${this.options.pluginName}${
                this.options.pluginVersion === 'latest' ? '' : `@${this.options.pluginVersion}`
              }" installed  ${style.aside(
                `(${Math.floor(
                  (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
                )}s)`
              )}`
            );
          });
      });
  }

  async pluginInstall() {
    const serviceDir = this.serverless.serviceDir;
    const packageJsonFilePath = path.join(serviceDir, 'package.json');

    return fileExists(packageJsonFilePath)
      .then((exists) => {
        // check if package.json is already present. Otherwise create one
        if (!exists) {
          mainProgress.notice('Creating an empty package.json file', { isMainEvent: true });
          legacy.log('Creating an empty package.json file in your service directory');

          const packageJsonFileContent = {
            name: this.serverless.service.service,
            description: '',
            version: '0.1.0',
            dependencies: {},
            devDependencies: {},
          };
          return fse.writeJson(packageJsonFilePath, packageJsonFileContent);
        }
        return BbPromise.resolve();
      })
      .then(() => {
        // install the package through npm
        const pluginFullName = `${this.options.pluginName}@${this.options.pluginVersion}`;
        const message = [
          `Installing plugin "${pluginFullName}"`,
          ' (this might take a few seconds...)',
        ].join('');
        legacy.log(message);
        mainProgress.notice(
          `Installing plugin "${this.options.pluginName}${
            this.options.pluginVersion === 'latest' ? '' : `@${this.options.pluginVersion}`
          }"`,
          { isMainEvent: true }
        );
        return this.npmInstall(pluginFullName);
      });
  }

  async addPluginToServerlessFile() {
    const serverlessFilePath = this.getServerlessFilePath();
    const fileExtension = path.extname(serverlessFilePath);
    if (fileExtension === '.js' || fileExtension === '.ts') {
      requestManualUpdate(serverlessFilePath);
      return;
    }

    const checkIsArrayPluginsObject = (pluginsObject) =>
      pluginsObject == null || Array.isArray(pluginsObject);
    // pluginsObject type determined based on the value loaded during the serverless init.
    if (_.last(serverlessFilePath.split('.')) === 'json') {
      const serverlessFileObj = await fse.readJson(serverlessFilePath);
      const newServerlessFileObj = serverlessFileObj;
      const isArrayPluginsObject = checkIsArrayPluginsObject(newServerlessFileObj.plugins);
      // null modules property is not supported
      let plugins = isArrayPluginsObject
        ? newServerlessFileObj.plugins || []
        : newServerlessFileObj.plugins.modules;

      if (plugins == null) {
        throw new ServerlessError(
          'plugins modules property must be present',
          'PLUGINS_MODULES_MISSING'
        );
      }

      plugins.push(this.options.pluginName);
      plugins = _.sortedUniq(plugins);

      if (isArrayPluginsObject) {
        newServerlessFileObj.plugins = plugins;
      } else {
        newServerlessFileObj.plugins.modules = plugins;
      }

      await fse.writeJson(serverlessFilePath, newServerlessFileObj);
      return;
    }

    const serverlessFileObj = yaml.load(await fsp.readFile(serverlessFilePath, 'utf8'), {
      filename: serverlessFilePath,
      schema: cloudformationSchema,
    });
    if (serverlessFileObj.plugins != null) {
      // Plugins section can be behind veriables, opt-out in such case
      if (isPlainObject(serverlessFileObj.plugins)) {
        if (
          serverlessFileObj.plugins.modules != null &&
          !Array.isArray(serverlessFileObj.plugins.modules)
        ) {
          requestManualUpdate(serverlessFilePath);
          return;
        }
      } else if (!Array.isArray(serverlessFileObj.plugins)) {
        requestManualUpdate(serverlessFilePath);
        return;
      }
    }
    await yamlAstParser.addNewArrayItem(
      serverlessFilePath,
      checkIsArrayPluginsObject(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
      this.options.pluginName
    );
  }

  async installPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serverless.serviceDir,
      'node_modules',
      this.options.pluginName,
      'package.json'
    );
    return fse.readJson(pluginPackageJsonFilePath).then((pluginPackageJson) => {
      if (pluginPackageJson.peerDependencies) {
        const pluginsArray = [];
        Object.entries(pluginPackageJson.peerDependencies).forEach(([k, v]) => {
          pluginsArray.push(`${k}@"${v}"`);
        });
        return BbPromise.map(pluginsArray, this.npmInstall);
      }
      return BbPromise.resolve();
    });
  }

  async npmInstall(name) {
    return npmCommandDeferred.then(({ command, args }) =>
      childProcess.execAsync(`${command} ${args.join(' ')} install --save-dev ${name}`, {
        stdio: 'ignore',
      })
    );
  }
}

module.exports = PluginInstall;
