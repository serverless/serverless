/**
 * General Utilities
 */
import path from 'path'
import archiver from 'archiver'
import { Writable } from 'stream'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

export const getFunctionsDirectories = ({ servicePath, templateFile }) => {
  const functionCodeUris = {}

  // Extract Serverless function resources and their CodeUris
  if (templateFile.Resources) {
    for (const [resourceName, resourceProperties] of Object.entries(
      templateFile.Resources,
    )) {
      if (
        resourceProperties.Type === 'AWS::Serverless::Function' &&
        resourceProperties.Properties
      ) {
        resourceProperties.Properties.CodeUri =
          resourceProperties.Properties.CodeUri ||
          templateFile.Resources?.Globals?.Function?.CodeUri ||
          '.'

        functionCodeUris[resourceName] = {
          code: path.join(servicePath, resourceProperties.Properties.CodeUri),
        }
      }
    }
  }

  return functionCodeUris
}

export const zip = async (functions) => {
  const output = {}

  for (const [functionName, { code: codePath }] of Object.entries(functions)) {
    // Create a buffer array to store chunks of data
    const chunks = []

    // Create a writable stream to collect data in memory
    const bufferStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk) // Collect chunks of data
        callback()
      },
    })

    const archive = archiver('zip', { zlib: { level: 9 } })

    // Handle archive warnings
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') {
        throw err
      }
    })

    // Handle archive errors
    archive.on('error', (err) => {
      throw err
    })

    // Pipe the archive output into our writable buffer stream
    archive.pipe(bufferStream)

    // Add the directory to the archive
    archive.directory(codePath, false)

    // Finalize the archive (complete the zip)
    await archive.finalize()

    // Combine all chunks into a single Buffer
    const zipBuffer = Buffer.concat(chunks)

    output[functionName] = {
      code: codePath,
      zip: zipBuffer, // Provide the complete zip data as a buffer
    }
  }

  return output
}

export const getCfnConfig = ({
  options = {},
  samConfigFile = {},
  composeServiceName,
}) => {
  const stage = options.stage || 'dev'
  const samConfig = samConfigFile

  const defaultConfig = samConfig.default
  const stageConfig = samConfig[stage]

  const stackName =
    options.stack ||
    stageConfig?.deploy?.parameters?.stack_name ||
    stageConfig?.global?.parameters?.stack_name ||
    defaultConfig?.deploy?.parameters?.stack_name ||
    defaultConfig?.global?.parameters?.stack_name ||
    composeServiceName // That is the service key in a serverless-compose.yml file if applicable

  if (!stackName) {
    throw new ServerlessError(
      'Please specify a stack name using the --stack option, or persist it in the samconfig.toml file.',
      ServerlessErrorCodes.sam.MISSING_STACK_NAME,
    )
  }

  const region =
    options.region ||
    stageConfig?.deploy?.parameters?.region ||
    stageConfig?.global?.parameters?.region ||
    defaultConfig?.deploy?.parameters?.region ||
    defaultConfig?.global?.parameters?.region ||
    'us-east-1'

  const bucket =
    options.bucket ||
    stageConfig?.deploy?.parameters?.s3_bucket ||
    stageConfig?.global?.parameters?.s3_bucket ||
    defaultConfig?.deploy?.parameters?.s3_bucket ||
    defaultConfig?.global?.parameters?.s3_bucket

  const template =
    stageConfig?.deploy?.parameters?.template_file ||
    stageConfig?.global?.parameters?.template_file ||
    defaultConfig?.deploy?.parameters?.template_file ||
    defaultConfig?.global?.parameters?.template_file ||
    'template.yml'

  const parameterOverrides =
    stageConfig?.deploy?.parameters?.parameter_overrides ||
    stageConfig?.global?.parameters?.parameter_overrides ||
    defaultConfig?.deploy?.parameters?.parameter_overrides ||
    defaultConfig?.global?.parameters?.parameter_overrides

  const parameters = []
  if (parameterOverrides) {
    const pairs = parameterOverrides.split(' ')

    pairs.forEach((pair) => {
      const [key, value] = pair.split('=')
      parameters.push({
        ParameterKey: key,
        ParameterValue: value,
      })
    })
  }

  return {
    stackName,
    region,
    stage,
    bucket,
    template,
    parameters,
  }
}
