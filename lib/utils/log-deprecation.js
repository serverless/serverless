import path from 'path'
import fse from 'fs-extra'
import fsp from 'fs/promises'
import weakMemoizee from 'memoizee/weak.js'
import _ from 'lodash'
import ServerlessError from '../serverless-error.js'
import safeMoveFile from './fs/safe-move-file.js'
import utils from '@serverlessinc/sf-core/src/utils.js'
import healthStatusFilename from './health-status-filename.js'

const { log, style } = utils
const disabledDeprecationCodesByEnv = extractCodes(
  process.env.SLS_DEPRECATION_DISABLE,
)

const notificationModeByEnv = process.env.SLS_DEPRECATION_NOTIFICATION_MODE

export const triggeredDeprecations = new Set()
const bufferedDeprecations = []

const deprecationLogger = log.get('deprecation')

function extractCodes(codesStr) {
  if (!codesStr) {
    return new Set()
  }
  return new Set(codesStr.split(','))
}

const resolveDisabledDeprecationsByService = weakMemoizee((serviceConfig) => {
  let disabledDeprecations = []
  if (typeof serviceConfig.disabledDeprecations === 'string') {
    disabledDeprecations = [serviceConfig.disabledDeprecations]
  } else {
    disabledDeprecations = Array.from(serviceConfig.disabledDeprecations || [])
  }
  return new Set(disabledDeprecations)
})

const resolveMode = (serviceConfig) => {
  switch (notificationModeByEnv) {
    case 'error':
    case 'warn':
      return notificationModeByEnv
    default:
  }
  const modeByConfig = _.get(serviceConfig, 'deprecationNotificationMode')
  switch (modeByConfig) {
    case 'error':
    case 'warn':
      return modeByConfig
    default:
      return defaultMode
  }
}

function writeDeprecation(code, message) {
  const messageLines = message.split('\n')
  if (!code.startsWith('EXT_')) {
    messageLines.push(
      `More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`,
    )
  }
  log.warning(messageLines.join('\n'))
}

export default (code, message, { serviceConfig } = {}) => {
  try {
    if (
      triggeredDeprecations.has(code) ||
      disabledDeprecationCodesByEnv.has(code) ||
      disabledDeprecationCodesByEnv.has('*')
    ) {
      return
    }

    if (serviceConfig) {
      const serviceDisabledCodes =
        resolveDisabledDeprecationsByService(serviceConfig)
      if (serviceDisabledCodes.has(code) || serviceDisabledCodes.has('*')) {
        return
      }
    }

    switch (resolveMode(serviceConfig)) {
      case 'error':
        throw new ServerlessError(
          `${message}\n  More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`,
          `REJECTED_DEPRECATION_${code}`,
        )
      case 'warn':
        writeDeprecation(code, message)
        return
      default:
        bufferedDeprecations.push({ message, code })
    }
  } finally {
    triggeredDeprecations.add(code)
  }
}

export const defaultMode = 'warn:summary'

export const printSummary = async () => {
  if (!bufferedDeprecations.length) {
    try {
      await fsp.unlink(healthStatusFilename)
    } catch {
      // ignore
    }
    return
  }

  try {
    const healthStatus = []

    deprecationLogger.warning()

    if (bufferedDeprecations.length === 1) {
      healthStatus.push('1 deprecation triggered in the last command:', '')
      deprecationLogger.warning(
        style.aside(
          "1 deprecation found: run 'serverless doctor' for more details",
        ),
      )
    } else {
      healthStatus.push(
        `${bufferedDeprecations.length} deprecations triggered in the last command:`,
        '',
      )
      deprecationLogger.warning(
        style.aside(
          `${bufferedDeprecations.length} deprecations found: run 'serverless doctor' for more details`,
        ),
      )
    }
    for (const { code, message } of bufferedDeprecations) {
      healthStatus.push(message)
      if (!code.startsWith('EXT_')) {
        healthStatus.push(
          style.aside(
            `More info: https://serverless.com/framework/docs/deprecations/#${code}`,
          ),
        )
      }
    }

    const tmpDir = await fsp.mkdtemp('sls-ld')

    const tmpHealthStatusFilename = path.resolve(tmpDir, 'health-status')
    await Promise.all([
      fse.ensureDir(path.dirname(healthStatusFilename)),
      fsp.writeFile(tmpHealthStatusFilename, healthStatus.join('\n')),
    ])
    try {
      await safeMoveFile(tmpHealthStatusFilename, healthStatusFilename)
    } catch (error) {
      if (error.code === 'EACCES') {
        log.error(
          'Cannot store information on approached deprecation. Please ensure process has write access to the ~/.serverless directory',
        )
      } else {
        throw error
      }
    } finally {
      await fsp.rmdir(tmpDir)
    }
  } finally {
    bufferedDeprecations.length = 0
  }
}
