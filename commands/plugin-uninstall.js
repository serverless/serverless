'use strict';

const spawn = require('child-process-ext/spawn');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const yaml = require('js-yaml');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const { log, progress, style } = require('@serverless/utils/log');
const yamlAstParser = require('../lib/utils/yaml-ast-parser');
const npmCommandDeferred = require('../lib/utils/npm-command-deferred');
const {
  getPluginInfo,
  getServerlessFilePath,
  validate,
} = require('../lib/commands/plugin-management');

const mainProgress = progress.get('main');

module.exports = async ({ configuration, serviceDir, configurationFilename, options }) => {
  const commandRunStartTime = Date.now();
  validate({ serviceDir });

  const pluginInfo = getPluginInfo(options.name);
  const pluginName = pluginInfo.name;
  const configurationFilePath = getServerlessFilePath({ serviceDir, configurationFilename });

  const context = { configuration, serviceDir, configurationFilePath, pluginName };
  mainProgress.notice(`Uninstalling plugin "${pluginName}"`, { isMainEvent: true });
  await uninstallPlugin(context);
  await removePluginFromServerlessFile(context);

  log.notice();
  log.notice.success(
    `Plugin "${pluginName}" uninstalled ${style.aside(
      `(${Math.floor((Date.now() - commandRunStartTime) / 1000)}s)`
    )}`
  );
};

const uninstallPlugin = async ({ serviceDir, pluginName }) => {
  await npmUninstall(pluginName, { serviceDir });
};

const removePluginFromServerlessFile = async ({ configurationFilePath, pluginName }) => {
  const fileExtension = path.extname(configurationFilePath);
  if (fileExtension === '.js' || fileExtension === '.ts') {
    requestManualUpdate(configurationFilePath);
    return;
  }

  if (fileExtension === '.json') {
    const serverlessFileObj = await fse.readJson(configurationFilePath);
    const isArrayPluginsObject = Array.isArray(serverlessFileObj.plugins);
    const plugins = isArrayPluginsObject
      ? serverlessFileObj.plugins
      : serverlessFileObj.plugins && serverlessFileObj.plugins.modules;

    if (plugins) {
      _.pull(plugins, pluginName);
      if (!plugins.length) {
        if (isArrayPluginsObject) {
          delete serverlessFileObj.plugins;
        } else {
          delete serverlessFileObj.plugins.modules;
        }
      }
      await fse.writeJson(configurationFilePath, serverlessFileObj);
    }
    return;
  }

  const serverlessFileObj = yaml.load(await fsp.readFile(configurationFilePath, 'utf8'), {
    filename: configurationFilePath,
    schema: cloudformationSchema,
  });
  if (serverlessFileObj.plugins != null) {
    // Plugins section can be behind variables, opt-out in such case
    if (isPlainObject(serverlessFileObj.plugins)) {
      if (
        serverlessFileObj.plugins.modules != null &&
        !Array.isArray(serverlessFileObj.plugins.modules)
      ) {
        requestManualUpdate(configurationFilePath);
        return;
      }
    } else if (!Array.isArray(serverlessFileObj.plugins)) {
      requestManualUpdate(configurationFilePath);
      return;
    }
  }
  await yamlAstParser.removeExistingArrayItem(
    configurationFilePath,
    Array.isArray(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
    pluginName
  );
};

const npmUninstall = async (name, { serviceDir }) => {
  const { command, args } = await npmCommandDeferred;
  try {
    await spawn(command, [...args, 'uninstall', '--save-dev', name], {
      cwd: serviceDir,
      stdio: 'pipe',
    });
  } catch (error) {
    log.error(String(error.stderrBuffer));
    throw error;
  }
};

const requestManualUpdate = (configurationFilePath) => {
  log.notice();
  log.notice.skip(
    `Can't automatically remove plugin from "${path.basename(
      configurationFilePath
    )}" file. Please make it manually.`
  );
};
