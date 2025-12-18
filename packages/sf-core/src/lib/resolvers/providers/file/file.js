import { AbstractProvider } from '../index.js'
import path from 'path'
import { promises as fsPromises } from 'node:fs'
import yaml from 'js-yaml'
import { pathToFileURL } from 'url'
import cloudformationSchema from '../../../../utils/fs/cloudformation-schema.js'

export class File extends AbstractProvider {
  static type = 'file'
  static resolvers = ['file']
  static defaultResolver = 'file'

  static validateConfig(providerConfig) {}

  resolveVariable({ resolverType, resolutionDetails, key }) {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'file') {
      return resolveVariableFromFile(
        this.resolveVariableFunc,
        this.resolveConfigurationPropertyFunc,
        this.options,
        this.configFileDirPath,
        key,
      )
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const getValueAtPath = (propertyPath, data) => {
  if (!propertyPath) return data
  const properties = propertyPath.split('.')
  let value = data
  for (const property of properties) {
    if (value === undefined || value === null) return null
    if (property.includes('[') && property.includes(']')) {
      const [arrayName, index] = property.split(/[[]]/).filter(Boolean)
      value = value[arrayName][index]
    } else {
      value = value[property]
    }
  }
  return value
}

const resolveVariableFromFile = async (
  resolveVariableFunc,
  resolveConfigurationPropertyFunc,
  options,
  configFileDirPath,
  key,
) => {
  // Split the key into filePath and propertyPath
  const [filePath, propertyPath] = key.split('#')
  const absoluteFilePath = path.resolve(configFileDirPath, filePath)
  const extension = path.extname(absoluteFilePath).toLowerCase()

  let data
  switch (extension) {
    case '.tfstate':
    case '.json':
      data = await parseJson(absoluteFilePath)
      if (!data) return null
      data = getValueAtPath(propertyPath, data)
      break
    case '.yml':
    case '.yaml':
      data = await parseYaml(absoluteFilePath)
      if (!data) return null
      data = getValueAtPath(propertyPath, data)
      break
    case '.js':
    case '.cjs':
    case '.mjs':
      data = await resolveJsModule(
        absoluteFilePath,
        options,
        propertyPath,
        resolveVariableFunc,
        resolveConfigurationPropertyFunc,
      )
      break
    default:
      data = await readFile(absoluteFilePath)
  }
  return data
}

const readFile = async (filePath) => {
  try {
    return await fsPromises.readFile(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null // File not found
    throw new Error(`Cannot read "${filePath}": ${error.message}`)
  }
}

const parseJson = async (filePath) => {
  const content = await readFile(filePath)
  if (content == null) return null
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Cannot parse JSON from "${filePath}": ${error.message}`)
  }
}

const parseYaml = async (filePath) => {
  const content = await readFile(filePath)
  if (content == null) return null
  try {
    const data = yaml.load(content, { schema: cloudformationSchema })
    // Use `JSON.parse(JSON.stringify())` to ensure YAML anchors and aliases are resolved as independent objects,
    // eliminating shared references in the parsed output and avoiding unintended side effects.
    return JSON.parse(JSON.stringify(data))
  } catch (error) {
    throw new Error(`Cannot parse YAML from "${filePath}": ${error.message}`)
  }
}

const resolveJsModule = async (
  filePath,
  options,
  propertyPath,
  resolveVariableFunc,
  resolveConfigurationPropertyFunc,
) => {
  try {
    const module = await import(pathToFileURL(filePath))
    // ESM dynamic import returns an object with a `default` property
    // CommonJS `require` returns the exported value directly
    // We normalize the behavior to return the exported value directly
    const defaultExport = module?.default
    if (typeof defaultExport === 'function') {
      const result = await defaultExport({
        options,
        resolveVariable: resolveVariableFunc,
        resolveConfigurationProperty: resolveConfigurationPropertyFunc,
      })
      return getValueAtPath(propertyPath, result)
    } else {
      let exportedValue
      if (propertyPath) {
        // First, try to read the property from the module namespace.
        // This works for ESM and for CJS when Node synthesizes named exports
        // (e.g., module.exports.value = '...').
        exportedValue = getValueAtPath(propertyPath, module)
        // If not found, fall back to reading from the default export object.
        // This supports CJS patterns like: module.exports = { value: '...' }.
        if (
          exportedValue == null &&
          defaultExport &&
          typeof defaultExport === 'object'
        ) {
          exportedValue = getValueAtPath(propertyPath, defaultExport)
        }
      } else {
        exportedValue = defaultExport
      }
      if (typeof exportedValue === 'function') {
        return await exportedValue({
          options,
          resolveVariable: resolveVariableFunc,
          resolveConfigurationProperty: resolveConfigurationPropertyFunc,
        })
      }
      return exportedValue
    }
  } catch (error) {
    throw new Error(
      `Cannot load or execute JS module "${filePath}": ${error.stack || error}`,
    )
  }
}
