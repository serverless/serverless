import spawn from 'child-process-ext/spawn.js'
import fsp from 'fs/promises'
import fse from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import isPlainObject from 'type/plain-object/is.js'
import yaml from 'js-yaml'
import cloudformationSchema from '../../../utils/fs/cloudformation-schema.js'
import { ServerlessError, log, progress, style } from '@serverless/util'
import {
  getPluginInfo,
  getServerlessFilePath,
  validate,
} from './plugin-management.js'
import yamlAstParser from '../../../utils/fs/yaml-ast-parser.js'
import npmCommandDeferred from '../../../utils/fs/npm-command-deferred.js'

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
    log.notice(`  Uninstalls a Serverless Plugin from your service.`)
    log.blankLine()
    log.aside('Usage')
    log.notice(`  serverless plugin uninstall <options>`)
    log.notice(`  sls plugin uninstall <options>`)
    log.blankLine()
    log.aside('Options')
    log.notice(`  --name         The name of the plugin you want to uninstall.`)
    log.notice(
      `  --help / -h       Get help for the serverless plugin uninstall command`,
    )
    log.blankLine()

    return
  }

  if (!pluginNameVersion) {
    throw new ServerlessError(
      'Please provide the name of the plugin you want to uninstall with the --name argument',
      'MISSING_PLUGIN_NAME',
    )
  }

  const serviceDir = configFileDirPath

  const commandRunStartTime = Date.now()
  validate({ serviceDir })

  const pluginInfo = getPluginInfo(pluginNameVersion)
  const pluginName = pluginInfo.name
  const configurationFilePath = getServerlessFilePath({
    serviceDir,
    configurationFilename,
  })

  const context = {
    configuration,
    serviceDir,
    configurationFilePath,
    pluginName,
  }
  mainProgress.notice(`Uninstalling plugin "${pluginName}"`, {
    isMainEvent: true,
  })
  await uninstallPlugin(context)
  await removePluginFromServerlessFile(context)

  log.success(
    `Plugin "${pluginName}" uninstalled ${style.aside(
      `(${Math.floor((Date.now() - commandRunStartTime) / 1000)}s)`,
    )}`,
  )
}

const uninstallPlugin = async ({ serviceDir, pluginName }) => {
  await npmUninstall(pluginName, { serviceDir })
}

const removePluginFromServerlessFile = async ({
  configurationFilePath,
  pluginName,
}) => {
  const fileExtension = path.extname(configurationFilePath)
  if (fileExtension === '.js' || fileExtension === '.ts') {
    requestManualUpdate(configurationFilePath)
    return
  }

  if (fileExtension === '.json') {
    const serverlessFileObj = await fse.readJson(configurationFilePath)
    const isArrayPluginsObject = Array.isArray(serverlessFileObj.plugins)
    const plugins = isArrayPluginsObject
      ? serverlessFileObj.plugins
      : serverlessFileObj.plugins && serverlessFileObj.plugins.modules

    if (plugins) {
      _.pull(plugins, pluginName)
      if (!plugins.length) {
        if (isArrayPluginsObject) {
          delete serverlessFileObj.plugins
        } else {
          delete serverlessFileObj.plugins.modules
        }
      }
      await fse.writeJson(configurationFilePath, serverlessFileObj, {
        spaces: 2,
      })
    }
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
    // Plugins section can be behind variables, opt-out in such case
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
  await yamlAstParser.removeExistingArrayItem(
    configurationFilePath,
    Array.isArray(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
    pluginName,
  )
}

const npmUninstall = async (name, { serviceDir }) => {
  const { command, args } = await npmCommandDeferred
  try {
    await spawn(command, [...args, 'uninstall', '--save-dev', name], {
      cwd: serviceDir,
      stdio: 'pipe',
    })
  } catch (error) {
    log.error(String(error.stderrBuffer))
    throw error
  }
}

const requestManualUpdate = (configurationFilePath) => {
  log.notice()
  log.error(
    `Can't automatically remove plugin from "${path.basename(
      configurationFilePath,
    )}" file. Please make it manually.`,
  )
}
