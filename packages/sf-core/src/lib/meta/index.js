import {
  fileExists,
  getDotServerlessLocalPath,
  readFile,
  writeFile,
} from '../../utils/index.js'
import path from 'path'
import _ from 'lodash'

/**
 * Saves the meta record to the global .serverless directory.
 *
 * @param {Object} params - Parameters required for saving meta.
 * @param {Object} params.metaObject - The Meta configuration object.
 * @param {Object} params.logger - Logger instance for debugging.
 */
const saveMeta = async ({ metaObject, logger }) => {
  logger.debug('Saving meta record to global .serverless directory.')

  // Clone the MetaObject to prevent mutation
  const clonedMetaObject = _.cloneDeep(metaObject)

  // Handle Error serialization
  if (clonedMetaObject.error instanceof Error) {
    clonedMetaObject.error = {
      message: clonedMetaObject.error.message,
      stack: clonedMetaObject.error.stack,
      code: clonedMetaObject.error.code,
    }
  }

  /**
   * Redact sensitive information from the Meta object.
   */
  const redact = (obj) => {
    const keysToRedact = [
      'access_key',
      'accessKey',
      'apiKey',
      'api_key',
      'secret',
      'token',
      'password',
      'credential',
      'private_key',
      'privateKey',
    ]

    Object.keys(obj || {}).forEach((key) => {
      if (
        keysToRedact.some((keyToRedact) =>
          key.toLowerCase().includes(keyToRedact.toLowerCase()),
        )
      ) {
        obj[key] = '<REDACTED>'
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redact(obj[key])
      }
    })
  }
  redact(clonedMetaObject)

  // Resolve the path to the .serverless directory
  const dotServerlessPath = getDotServerlessLocalPath({
    servicePath:
      clonedMetaObject.servicePath &&
      path.dirname(clonedMetaObject.servicePath),
  })
  if (path.dirname(dotServerlessPath) === '/') {
    logger.debug(
      '.serverless directory is not available. Skipping saving meta.',
    )
    return
  }
  const metaPath = path.join(dotServerlessPath, 'meta.json')

  // Load existing meta.json content
  let sourceContent = {}
  if (await fileExists(metaPath)) {
    try {
      const fileContent = await readFile(metaPath)
      sourceContent = JSON.parse(fileContent)
    } catch {
      sourceContent = {}
    }
  }

  // Define the service path
  const servicePath = clonedMetaObject.servicePath || 'unknown'

  // Handle persisting last known good values
  const lastMeta = sourceContent[servicePath]
  const lastRunMeta = {
    serviceProviderAwsCfStackId:
      clonedMetaObject.serviceProviderAwsCfStackId ||
      lastMeta?.serviceProviderAwsCfStackId ||
      null,
    serviceProviderAwsCfStackCreated:
      clonedMetaObject.serviceProviderAwsCfStackCreated ||
      lastMeta?.serviceProviderAwsCfStackCreated ||
      null,
    serviceProviderAwsCfStackUpdated:
      clonedMetaObject.serviceProviderAwsCfStackUpdated ||
      lastMeta?.serviceProviderAwsCfStackUpdated ||
      null,
    serviceProviderAwsCfStackStatus:
      clonedMetaObject.serviceProviderAwsCfStackStatus ||
      lastMeta?.serviceProviderAwsCfStackStatus ||
      null,
    serviceProviderAwsCfStackOutputs:
      clonedMetaObject.serviceProviderAwsCfStackOutputs ||
      lastMeta?.serviceProviderAwsCfStackOutputs ||
      null,
  }

  // Handle command and options
  if (clonedMetaObject.command || clonedMetaObject.options) {
    lastRunMeta.command = clonedMetaObject.command || []
    lastRunMeta.options = clonedMetaObject.options || {}
  } else {
    lastRunMeta.command = lastMeta?.command
    lastRunMeta.options = lastMeta?.options
  }

  // Prepare the content to save
  const contentToSave = {
    ...sourceContent,
    [servicePath]: {
      ...clonedMetaObject,
      ...lastRunMeta,
    },
  }

  // Write the updated meta.json content
  await writeFile(metaPath, JSON.stringify(contentToSave, null, 2))
}

export default saveMeta
