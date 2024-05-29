import spawn from 'child-process-ext/spawn.js'
import fsp from 'fs/promises'
import fse from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import isPlainObject from 'type/plain-object/is.js'
import yaml from 'js-yaml'
import cloudformationSchema from '@serverless/utils/cloudformation-schema.js'
import { utils } from '@serverlessinc/sf-core'
import ServerlessError from '../lib/serverless-error.js'
import yamlAstParser from '../lib/utils/yaml-ast-parser.js'
import npmCommandDeferred from '../lib/utils/npm-command-deferred.js'
import {
  getPluginInfo,
  getServerlessFilePath,
  validate,
} from '../lib/commands/plugin-management.js'

const { log, progress, style } = utils

const mainProgress = progress.get('main')

export default async ({
  configuration,
  serviceDir,
  configurationFilename,
  options,
}) => {
  const commandRunStartTime = Date.now()
  validate({ serviceDir })

  const pluginInfo = getPluginInfo(options.name)
  const pluginName = pluginInfo.name
  const pluginVersion = pluginInfo.version || 'latest'
  const configurationFilePath = getServerlessFilePath({
    serviceDir,
    configurationFilename,
  })

  const context = {
    configuration,
    serviceDir,
    configurationFilePath,
    pluginName,
    pluginVersion,
  }
  mainProgress.notice(
    `Installing plugin "${pluginName}${
      pluginVersion === 'latest' ? '' : `@${pluginVersion}`
    }"`,
    { isMainEvent: true },
  )
  await installPlugin(context)
  // Check if plugin is already added
  const pluginAlreadyPresentInConfig =
    (_.get(configuration, 'plugins.modules') &&
      configuration.plugin.modules.includes(pluginName)) ||
    (configuration.plugins && configuration.plugins.includes(pluginName))
  if (!pluginAlreadyPresentInConfig) {
    await addPluginToServerlessFile(context)
  }

  log.notice()
  log.notice.success(
    `Plugin "${pluginName}${
      pluginVersion === 'latest' ? '' : `@${pluginVersion}`
    }" installed  ${style.aside(
      `(${Math.floor((Date.now() - commandRunStartTime) / 1000)}s)`,
    )}`,
  )
}

const installPlugin = async ({ serviceDir, pluginName, pluginVersion }) => {
  const pluginFullName = `${pluginName}@${pluginVersion}`
  await npmInstall(pluginFullName, { serviceDir })
}

const addPluginToServerlessFile = async ({
  configurationFilePath,
  pluginName,
}) => {
  const fileExtension = path.extname(configurationFilePath)
  if (fileExtension === '.js' || fileExtension === '.ts') {
    requestManualUpdate(configurationFilePath)
    return
  }

  const checkIsArrayPluginsObject = (pluginsObject) =>
    pluginsObject == null || Array.isArray(pluginsObject)
  // pluginsObject type determined based on the value loaded during the serverless init.
  if (fileExtension === '.json') {
    const serverlessFileObj = await fse.readJson(configurationFilePath)
    const newServerlessFileObj = serverlessFileObj
    const isArrayPluginsObject = checkIsArrayPluginsObject(
      newServerlessFileObj.plugins,
    )
    // null modules property is not supported
    let plugins = isArrayPluginsObject
      ? newServerlessFileObj.plugins || []
      : newServerlessFileObj.plugins.modules

    if (plugins == null) {
      throw new ServerlessError(
        'plugins modules property must be present',
        'PLUGINS_MODULES_MISSING',
      )
    }

    plugins.push(pluginName)
    plugins = _.sortedUniq(plugins)

    if (isArrayPluginsObject) {
      newServerlessFileObj.plugins = plugins
    } else {
      newServerlessFileObj.plugins.modules = plugins
    }

    await fse.writeJson(configurationFilePath, newServerlessFileObj)
    return
  }

  const serverlessFileObj = yaml.load(
    await fsp.readFile(configurationFilePath, 'utf8'),
    {
      filename: configurationFilePath,
      schema: cloudformationSchema,
    },
  )
  if (serverlessFileObj.plugins != null) {
    // Plugins section can be behind veriables, opt-out in such case
    if (isPlainObject(serverlessFileObj.plugins)) {
      if (
        serverlessFileObj.plugins.modules != null &&
        !Array.isArray(serverlessFileObj.plugins.modules)
      ) {
        requestManualUpdate(configurationFilePath)
        return
      }
    } else if (!Array.isArray(serverlessFileObj.plugins)) {
      requestManualUpdate(configurationFilePath)
      return
    }
  }
  await yamlAstParser.addNewArrayItem(
    configurationFilePath,
    checkIsArrayPluginsObject(serverlessFileObj.plugins)
      ? 'plugins'
      : 'plugins.modules',
    pluginName,
  )
}

const npmInstall = async (name, { serviceDir }) => {
  const { command, args } = await npmCommandDeferred
  try {
    await spawn(command, [...args, 'install', '--save-dev', name], {
      cwd: serviceDir,
      stdio: 'pipe',
      // To parse quotes used in module versions. E.g. 'serverless@"^1.60.0 || 2"'
      // https://stackoverflow.com/a/48015470
      shell: true,
    })
  } catch (error) {
    log.error(String(error.stderrBuffer))
    throw error
  }
}

const requestManualUpdate = (configurationFilePath) => {
  log.notice()
  log.notice.skip(
    `Can't automatically add plugin into "${path.basename(
      configurationFilePath,
    )}" file. Please add it manually.`,
  )
}
