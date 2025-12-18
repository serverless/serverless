import path from 'path'
import { getConfigFilePath, readFile, getCliOption } from '../index.js'
import { ServerlessErrorCodes, ServerlessError } from '@serverless/util'
import readConfig from '@serverless/framework/lib/configuration/read.js'

export async function getConfigFileDetails(configFilePath) {
  // Find the path to the configuration file
  const configFileDirPath = configFilePath
    ? path.resolve(process.cwd(), path.dirname(configFilePath))
    : process.cwd()
  const customConfigFileName = configFilePath
    ? path.parse(path.basename(configFilePath)).name
    : null

  // Read the configuration file
  const { configFile, configFileRaw, configFileBaseName, isCompose, isCfn } =
    await readConfigFile(configFileDirPath, customConfigFileName)

  return {
    configFile,
    configFileRaw,
    configFileBaseName,
    configFileDirPath,
    isCompose,
    isCfn,
  }
}

const readConfigFile = async (
  configFileDirPath = process.cwd(),
  customConfigFileName,
) => {
  let configFilePath

  /**
   * Try to find a configuration file
   * Logic from the Serverless Framework allows us to read either
   * in any of these formats: YAML, JSON, JS, TS, CJS, MJS.
   */
  // If a custom config file name is provided, try to read it
  if (customConfigFileName) {
    configFilePath = await getConfigFilePath({
      configFileName: customConfigFileName,
      configFileDirPath,
    })
  } else {
    // If no custom config file name is provided, try to read 'serverless'
    // and 'serverless-compose' in the current working directory
    const potentialConfigFileNames = ['serverless', 'serverless-compose']
    for (const potentialConfigFileName of potentialConfigFileNames) {
      configFilePath = await getConfigFilePath({
        configFileName: potentialConfigFileName,
        configFileDirPath,
      })
      if (configFilePath) break
    }
  }

  if (!configFilePath) {
    let samConfigFile
    let templateFile
    let templateFilePath
    const samConfigFilePath = await getConfigFilePath({
      configFileDirPath,
      configFileName: 'samconfig',
    })

    const defaultTemplateFilePath = await getConfigFilePath({
      configFileDirPath,
      configFileName: 'template',
    })

    if (samConfigFilePath) {
      // samconfig.toml exists, attempt to read custom template file name
      samConfigFile = await readConfig(samConfigFilePath)

      /**
       * The optional template file parameter in the samconfig file
       * could be specified in the default or stage specific deploy config.
       */
      const template_file = getCliOption('stage')
        ? samConfigFile[getCliOption('stage')]?.deploy.parameters.template_file
        : samConfigFile?.default?.deploy?.parameters?.template_file // we only care about the deploy parameters

      if (template_file) {
        // user spcified a custom template file name
        const specifiedTemplateFilePath = await getConfigFilePath({
          configFileDirPath,
          configFileName: template_file.split('.')[0], // because it is usually specified like this: template.yaml
        })

        if (!specifiedTemplateFilePath) {
          // samconfig file found, but the specified custom template file name does not exist
          const err = new ServerlessError(
            `Could not find the specified template file "${template_file}"`,
            ServerlessErrorCodes.sam.TEMPLATE_FILE_NOT_FOUND,
          )
          err.stack = undefined
          throw err
        }

        // samconfig file found and custom template file name specified and found.
        templateFilePath = specifiedTemplateFilePath
        templateFile = await readConfig(specifiedTemplateFilePath)
      } else {
        // samconfig file found, but no custom template file name specified. Use default template file.
        templateFilePath = defaultTemplateFilePath
        templateFile = await readConfig(defaultTemplateFilePath)
      }
    } else if (defaultTemplateFilePath) {
      // samconfig file not found, but default template file found
      templateFilePath = defaultTemplateFilePath
      templateFile = await readConfig(defaultTemplateFilePath)
    } else {
      const err = new ServerlessError(
        `Configuration file not found in directory "${configFileDirPath}"`,
        ServerlessErrorCodes.general.CONFIG_FILE_NOT_FOUND,
      )
      err.stack = undefined
      throw err
    }

    // This is the latest and only valid format version for AWS SAM templates
    // REF: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/format-version-structure.html
    // We have to explicitly set it because the parser reads it as
    // date type '2010-09-09T00:00:00.000Z' if it is without quotes
    templateFile.AWSTemplateFormatVersion = '2010-09-09'

    /**
     * At this point, we have found a template file, and maybe a samconfig file.
     */
    return {
      configFile: { templateFile, samConfigFile: samConfigFile || {} },
      configFileBaseName: templateFilePath,
      isCfn: true,
    }
  }

  /**
   * If a config file path is found, try to read it.
   */
  try {
    const configFile = await readConfig(configFilePath)
    const configFileRaw = await readFile(configFilePath)
    const configFileBaseName = path.basename(configFilePath)
    return {
      configFile,
      configFileRaw,
      configFileBaseName,
      isCompose: path.parse(configFileBaseName).name === 'serverless-compose',
    }
  } catch (error) {
    const err = new ServerlessError(
      `Could not read the config file at path "${configFilePath}" due to this error: ${error.message}`,
      ServerlessErrorCodes.general.FAILED_TO_READ_CONFIG_FILE,
    )
    err.stack = undefined
    throw err
  }
}
