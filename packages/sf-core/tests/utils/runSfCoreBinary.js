import { spawn } from 'child_process'
import os from 'os'
import url from 'url'

/**
 * @typedef {import('@jest/globals').jest} JestGlobal
 * @typedef {Object} coreParams
 * @property {string} servicePath
 * @property {string[]} command
 * @property {Record<string, any>} [options]
 *
 * @typedef {Object} RunSfCoreBinaryParams
 * @property {coreParams} runBinaryParams
 * @property {JestGlobal} jest
 * @property {boolean} expectError
 *
 * @param {Promise<RunSfCoreBinaryParams>} params
 */
export const runSfCoreBinary = async ({
  jest,
  runBinaryParams,
  expectError = false,
}) => {
  const args = [runBinaryParams.command.join(' ')]
  if (
    runBinaryParams.options &&
    Object.keys(runBinaryParams.options).length > 0
  ) {
    Object.entries(runBinaryParams.options).forEach(([key, value]) => {
      args.push(key)
      args.push(value)
    })
  }

  const childProcess = spawn(getBinaryPathForCurrentSystem(), args, {
    cwd: runBinaryParams.servicePath,
    env: process.env,
  })

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
      if (
        !expectError &&
        (chunk.toLowerCase().includes('error') || chunk.includes('✖'))
      ) {
        reject(new Error('Error not Expected'))
      }
    })
  })
}

const getBinaryPathForCurrentSystem = () => {
  const osSystem = os.type()
  const architecture = os.arch()
  const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

  const binaryPath = `${__dirname}../../dist/binaries/sf-core-${convertSystemToBinarySuffix(osSystem)}-${architecture}`
  return binaryPath
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
