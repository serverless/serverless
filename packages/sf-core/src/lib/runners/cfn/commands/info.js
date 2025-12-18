import Stack from '../aws/Stack.js'
import { getCfnConfig } from '../utils.js'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  progress,
  style,
} from '@serverless/util'

/**
 * Fetches service/stack information from AWS and displays it.
 * @param {Object} params
 * @param {Function} params.credentials - AWS credentials.
 * @param {Object} params.samConfigFile - SAM configuration file.
 * @param {Function} params.options - CLI options.
 * @param {Function} params.composeServiceName - Name of the service in a serverless-compose.yml file.
 */
export default async function ({
  credentials,
  samConfigFile,
  options,
  composeServiceName,
}) {
  const mainProgress = progress.get('main')
  mainProgress.notice('Fetching service information')

  const cfnConfig = getCfnConfig({
    options,
    samConfigFile,
    composeServiceName,
  })

  const service = cfnConfig.stackName
  const stage = cfnConfig.stage
  const region = cfnConfig.region

  const stack = new Stack({
    credentials,
    region: cfnConfig.region,
    name: cfnConfig.stackName,
    parameters: cfnConfig.parameters,
    onStatusUpdate: (status) => {},
    onFailedEvent: (event) => {},
  })

  await stack.get()

  if (!stack.status) {
    throw new ServerlessError(
      `Stack with id "${service}" does not exist`,
      ServerlessErrorCodes.sam.STACK_NOT_FOUND,
    )
  }

  log.write(`${style.aside('service:')} ${service}
${style.aside('stage:')} ${stage}
${style.aside('region:')} ${region}
${style.aside('stack:')} ${stack.name}`)

  const hasOutputs = stack.outputs && Object.keys(stack.outputs).length > 0

  if (hasOutputs) {
    log.write(style.aside(`outputs:`))
    for (const key in stack.outputs) {
      log.write(`   ${style.aside(key)}: ${stack.outputs[key]}`)
    }
    log.write(' ')
  }

  const state = {
    id: stack.id,
    outputs: stack.outputs || {},
  }

  return state
}
