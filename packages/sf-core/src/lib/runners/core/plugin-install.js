import spawn from 'child-process-ext/spawn.js'
import fsp from 'fs/promises'
import fse from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import isPlainObject from 'type/plain-object/is.js'
import yaml from 'js-yaml'
import cloudformationSchema from '../../../utils/fs/cloudformation-schema.js'
import {
  getPluginInfo,
  getServerlessFilePath,
  validate,
} from './plugin-management.js'
import yamlAstParser from '../../../utils/fs/yaml-ast-parser.js'
import npmCommandDeferred from '../../../utils/fs/npm-command-deferred.js'
import { ServerlessError, log, progress, style } from '@serverless/util'

const mainProgress = progress.get('main')

export default async ({
  configuration,
  configurationFilename,
  configFileDirPath,
  pluginNameVersion,
  help,
}) => {
  /**
   * Render help and return if the user has specified the `--help` flag.
   */
  if (help) {
    log.aside('Description')
    log.notice(`  Installs and adds a plugin into your service.`)
    log.blankLine()
    log.aside('Usage')
    log.notice(`  serverless plugin install <options>`)
    log.notice(`  sls plugin install <options>`)
    log.blankLine()
    log.aside('Options')
    log.notice(`  --name         The name of the plugin you want to install.`)
    log.notice(
      `  --help / -h       Get help for the serverless plugin install command`,
    )
    log.blankLine()

    return
  }

  if (!pluginNameVersion) {
    throw new ServerlessError(
      'Please provide the name of the plugin you want to install with the --name argument',
      'MISSING_PLUGIN_NAME',
    )
  }

  const serviceDir = configFileDirPath
  const commandRunStartTime = Date.now()
  validate({ serviceDir })

  const pluginInfo = getPluginInfo(pluginNameVersion)
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

  log.success(
    `Plugin "${pluginName}${
      pluginVersion === 'latest' ? '' : `@${pluginVersion}`
    }" installed  ${style.aside(
      `(${Math.floor((Date.now() - commandRunStartTime) / 1000)}s)`,
    )}`,
  )
}

const installPlugin = async ({ serviceDir, pluginName, pluginVersion }) => {
  await npmInstall(pluginName, pluginVersion, { serviceDir })
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

    await fse.writeJson(configurationFilePath, newServerlessFileObj, {
      spaces: 2,
    })
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

const addOverrideIfNeeded = async (name, serviceDir) => {
  if (fse.existsSync(path.join(serviceDir, 'package.json'))) {
    const packageJson = JSON.parse(
      await fsp.readFile(path.join(serviceDir, 'package.json'), 'utf8'),
    )

    // Check if 'serverless' is in 'dependencies' or 'devDependencies'
    const hasServerlessDependency = ['dependencies', 'devDependencies'].some(
      (dependencyType) =>
        packageJson[dependencyType] && packageJson[dependencyType].serverless,
    )

    if (!hasServerlessDependency) {
      return
    }

    if (packageJson.overrides && !packageJson.overrides[name]) {
      packageJson.overrides[name] = { serverless: '$serverless' }
    } else if (!packageJson.overrides) {
      packageJson.overrides = { [name]: { serverless: '$serverless' } }
    }
    await fse.writeJson(path.join(serviceDir, 'package.json'), packageJson, {
      spaces: 2,
    })
  }
}

const npmInstall = async (pluginName, pluginVersion, { serviceDir }) => {
  await addOverrideIfNeeded(pluginName, serviceDir)
  const { command, args } = await npmCommandDeferred
  try {
    const pluginFullName = `${pluginName}@${pluginVersion}`
    await spawn(command, [...args, 'install', '--save-dev', pluginFullName], {
      cwd: serviceDir,
      stdio: 'pipe',
    })
  } catch (error) {
    log.error(String(error.stderrBuffer))
    throw error
  }
}

const requestManualUpdate = (configurationFilePath) => {
  log.error(
    `Can't automatically add plugin into "${path.basename(
      configurationFilePath,
    )}" file. Please add it manually.`,
  )
}
