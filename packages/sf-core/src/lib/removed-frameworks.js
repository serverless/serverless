import path from 'path'
import { readdir } from 'fs/promises'
import { ServerlessError } from '@serverless/util'

/**
 * Frameworks that were removed from the CLI. Keyed by the config file
 * basename (without extension) that used to select them.
 */
const REMOVED_FRAMEWORKS = {
  'serverless.containers': 'Serverless Container Framework',
  'serverless.ai': 'Serverless AI Framework',
}

const LAST_SUPPORTED_VERSION = '4.39.0'

/**
 * Throws a clear error when the working directory contains a config file
 * for a framework the CLI no longer supports, so users get guidance
 * instead of a generic "No configuration file found".
 *
 * @param {Object} params
 * @param {string} params.workingDir - Directory to inspect.
 * @returns {Promise<void>}
 * @throws {ServerlessError} FRAMEWORK_SUPPORT_REMOVED
 */
export const assertNoRemovedFrameworkConfig = async ({ workingDir }) => {
  let fileNames
  try {
    fileNames = (await readdir(workingDir, { withFileTypes: true }))
      .filter((dirent) => dirent.isFile())
      .map((dirent) => dirent.name)
  } catch {
    // Unreadable/missing directory: let the caller's regular
    // "No configuration file found" handling take over.
    return
  }

  for (const fileName of fileNames) {
    const baseName = path.basename(fileName, path.extname(fileName))
    const frameworkName = REMOVED_FRAMEWORKS[baseName]
    if (frameworkName) {
      throw new ServerlessError(
        `Support for ${frameworkName} ("${fileName}") has been removed from the Serverless Framework CLI. To manage or remove existing deployments, use the last supporting version: "npx serverless@${LAST_SUPPORTED_VERSION} <command>".`,
        'FRAMEWORK_SUPPORT_REMOVED',
        { stack: false },
      )
    }
  }
}
