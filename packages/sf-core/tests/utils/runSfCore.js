import spawnExt from 'child-process-ext/spawn.js'
import ServerlessCore from '@serverlessinc/sf-core/src/index.js'
import os from 'os'
import url from 'url'
import path from 'path'

export const getTestStageName = () => {
  const randomId = Math.floor(1000 + Math.random() * 9000).toString()

  if (process.env.TEST_STAGE && process.env.TEST_STAGE !== '') {
    return `${process.env.TEST_STAGE?.substring(0, 10)}t${randomId}`
      .toLocaleLowerCase()
      .replace('_', '-')
      .replace('--', '-')
  }

  return randomId
    .toLocaleLowerCase()
    .replace('_', '-')
    .replace('--', '-')
    .replace('[', '')
    .replace(']', '')
}

/**
 * Runs Serverless Core via the code or the binary,
 * with the provided parameters, and captures any errors
 * that occur during execution.
 *
 * @typedef {import('@jest/globals').jest} JestGlobal
 * @typedef {Object} SfCoreParams
 * @property {string} configFilePath
 * @property {Record<string, any>} options
 * @property {string[]} command
 *
 * @typedef {Object} RunSfCoreRequestParams
 * @property {SfCoreParams} coreParams
 * @property {JestGlobal} jest
 * @property {boolean} expectError
 *
 * @typedef {Object} RunSfCoreResponseParams
 * @property {number} errorCount
 * @property {Error[]} [errors]
 * @property {string[]} logs
 *
 * @param {RunSfCoreRequestParams} params
 * @returns {Promise<RunSfCoreResponseParams>}
 */
export const runSfCore = async ({ jest, coreParams, expectError = false }) => {
  if (process.env.BINARY_INTEGRATION_TESTS) {
    const logs = await runSfCoreBinary({
      coreParams,
      expectError,
    })
    return { errorCount: 0, errors: [], logs }
  }
  const originalConsole = { log: console.log }

  let errorCount = 0
  const errors = []

  const chunks = []
  jest.spyOn(console, 'log').mockImplementation((...args) => {
    for (const arg of args) {
      chunks.push(arg)
      if (arg?.name?.includes('Error') || arg?.toString().includes('✖')) {
        errorCount += 1
        errors.push(arg)
        if (!expectError) {
          originalConsole.log(errors)
          throw new Error('Should not receive error')
        }
      }
    }
    originalConsole.log(...args)
  })

  await ServerlessCore.run(coreParams)

  return {
    errorCount,
    errors,
    logs: chunks,
  }
}

/**
 * @typedef {Object} RunSfCoreBinaryResponseParams
 * @property {coreParams} coreParams
 * @property {boolean} expectError
 *
 * @param {Promise<RunSfCoreBinaryResponseParams>} params
 */
export const runSfCoreBinary = async ({
  coreParams,
  expectError = false,
  binaryPath = getBinaryPathForCurrentSystem(),
}) => {
  const args = coreParams.command
  if (coreParams.options && Object.keys(coreParams.options).length > 0) {
    Object.entries(coreParams.options).forEach(([key, value]) => {
      args.push(`--${key}=${value}`)
    })
  }

  const childProcess = spawnExt(binaryPath, args, {
    cwd: path.dirname(coreParams.customConfigFilePath),
    env: process.env,
  }).child

  const chunks = []
  await new Promise((resolve, reject) => {
    childProcess.on('exit', (code) => {
      if (code !== 0) {
        if (!expectError) {
          reject(new Error(`child process exited with code ${code}`))
        }
      }
      resolve()
    })

    childProcess.stdout.on('data', (data) => {
      process.stdout.write(data)
      const chunk = data.toString()
      chunks.push(chunk)
      if (
        !expectError &&
        (chunk.toLowerCase().includes('error') || chunk.includes('✖'))
      ) {
        reject(new Error('Error not Expected'))
      }
    })
    childProcess.stderr.on('data', (data) => {
      process.stdout.write(data)
      const chunk = data.toString()
      chunks.push(chunk)
      if (
        !expectError &&
        (chunk.toLowerCase().includes('error') || chunk.includes('✖'))
      ) {
        reject(new Error('Error not Expected'))
      }
    })
  })
  return chunks
}

const getBinaryPathForCurrentSystem = () => {
  const osSystem = os.type()
  const architecture = os.arch()
  const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

  return `${__dirname}../../dist/binaries/sf-core-${convertSystemToBinarySuffix(osSystem)}-${architecture}`
}

/**
 * @param {string} osSystem
 */
const convertSystemToBinarySuffix = (osSystem) => {
  if (osSystem === 'Darwin') {
    return 'macos'
  }
  if (osSystem === 'Linux') {
    return 'linux'
  }
  return 'win'
}
