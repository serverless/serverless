import spawn from 'child-process-ext/spawn.js'
import isWsl from 'is-wsl'
import fse from 'fs-extra'
import path from 'path'
import os from 'os'
import { ServerlessError } from '@serverless/util'

/**
 * Helper function to run a docker command
 * @param {string[]} options
 * @return {Object}
 */
async function dockerCommand(options, pluginInstance) {
  const cmd = 'docker'
  try {
    return await spawn(cmd, options, { encoding: 'utf-8' })
  } catch (e) {
    if (
      e.stderrBuffer &&
      e.stderrBuffer.toString().includes('command not found')
    ) {
      throw new ServerlessError(
        'docker not found! Please install it.',
        'PYTHON_REQUIREMENTS_DOCKER_NOT_FOUND',
        { stack: false },
      )
    }
    throw e
  }
}

/**
 * Build the custom Docker image
 * @param {string} dockerFile
 * @param {string[]} extraArgs
 * @return {string} The name of the built docker image.
 */
async function buildImage(dockerFile, extraArgs, pluginInstance) {
  const imageName = 'sls-py-reqs-custom'
  const options = ['build', '-f', dockerFile, '-t', imageName]

  if (Array.isArray(extraArgs)) {
    options.push(...extraArgs)
  } else {
    throw new ServerlessError(
      'dockerRunCmdExtraArgs option must be an array',
      'PYTHON_REQUIREMENTS_INVALID_DOCKER_EXTRA_ARGS',
      { stack: false },
    )
  }

  options.push('.')

  await dockerCommand(options, pluginInstance)
  return imageName
}

/**
 * Find a file that exists on all projects so we can test if Docker can see it too
 * @param {string} servicePath
 * @return {string} file name
 */
function findTestFile(servicePath, pluginInstance) {
  if (fse.pathExistsSync(path.join(servicePath, 'serverless.yml'))) {
    return 'serverless.yml'
  }
  if (fse.pathExistsSync(path.join(servicePath, 'serverless.yaml'))) {
    return 'serverless.yaml'
  }
  if (fse.pathExistsSync(path.join(servicePath, 'serverless.json'))) {
    return 'serverless.json'
  }
  if (fse.pathExistsSync(path.join(servicePath, 'requirements.txt'))) {
    return 'requirements.txt'
  }
  throw new ServerlessError(
    'Unable to find serverless.{yml|yaml|json} or requirements.txt for getBindPath()',
    'PYTHON_REQUIREMENTS_MISSING_GET_BIND_PATH_FILE',
    { stack: false },
  )
}

/**
 * Test bind path to make sure it's working
 * @param {string} bindPath
 * @return {boolean}
 */
async function tryBindPath(bindPath, testFile, pluginInstance) {
  const { serverless, log } = pluginInstance
  const debug = process.env.SLS_DEBUG
  const options = [
    'run',
    '--rm',
    '-v',
    `${bindPath}:/test`,
    'alpine',
    'ls',
    `/test/${testFile}`,
  ]
  try {
    if (debug) {
      if (log) {
        log.debug(`Trying bindPath ${bindPath} (${options})`)
      } else {
        serverless.cli.log(`Trying bindPath ${bindPath} (${options})`)
      }
    }
    const ps = await dockerCommand(options, pluginInstance)
    if (debug) {
      if (log) {
        log.debug(ps.stdoutBuffer.toString().trim())
      } else {
        serverless.cli.log(ps.stdoutBuffer.toString().trim())
      }
    }
    return ps.stdoutBuffer.toString().trim() === `/test/${testFile}`
  } catch (err) {
    if (debug) {
      if (log) {
        log.debug(`Finding bindPath failed with ${err}`)
      } else {
        serverless.cli.log(`Finding bindPath failed with ${err}`)
      }
    }
    return false
  }
}

/**
 * Get bind path depending on os platform
 * @param {object} serverless
 * @param {string} servicePath
 * @return {string} The bind path.
 */
async function getBindPath(servicePath, pluginInstance) {
  // Determine bind path
  let isWsl1 = isWsl && !os.release().includes('microsoft-standard')
  if (process.platform !== 'win32' && !isWsl1) {
    return servicePath
  }

  // test docker is available
  await dockerCommand(['version'], pluginInstance)

  // find good bind path for Windows
  let bindPaths = []
  let baseBindPath = servicePath.replace(/\\([^\s])/g, '/$1')
  let drive
  let path

  bindPaths.push(baseBindPath)
  if (baseBindPath.startsWith('/mnt/')) {
    // cygwin "/mnt/C/users/..."
    baseBindPath = baseBindPath.replace(/^\/mnt\//, '/')
  }
  if (baseBindPath[1] == ':') {
    // normal windows "c:/users/..."
    drive = baseBindPath[0]
    path = baseBindPath.substring(3)
  } else if (baseBindPath[0] == '/' && baseBindPath[2] == '/') {
    // gitbash "/c/users/..."
    drive = baseBindPath[1]
    path = baseBindPath.substring(3)
  } else {
    throw new Error(`Unknown path format ${baseBindPath.substr(10)}...`)
  }

  bindPaths.push(`/${drive.toLowerCase()}/${path}`) // Docker Toolbox (seems like Docker for Windows can support this too)
  bindPaths.push(`${drive.toLowerCase()}:/${path}`) // Docker for Windows
  // other options just in case
  bindPaths.push(`/${drive.toUpperCase()}/${path}`)
  bindPaths.push(`/mnt/${drive.toLowerCase()}/${path}`)
  bindPaths.push(`/mnt/${drive.toUpperCase()}/${path}`)
  bindPaths.push(`${drive.toUpperCase()}:/${path}`)

  const testFile = findTestFile(servicePath, pluginInstance)

  for (let i = 0; i < bindPaths.length; i++) {
    const bindPath = bindPaths[i]
    if (await tryBindPath(bindPath, testFile, pluginInstance)) {
      return bindPath
    }
  }

  throw new Error('Unable to find good bind path format')
}

/**
 * Find out what uid the docker machine is using
 * @param {string} bindPath
 * @return {boolean}
 */
async function getDockerUid(bindPath, pluginInstance) {
  const options = [
    'run',
    '--rm',
    '-v',
    `${bindPath}:/test`,
    'alpine',
    'stat',
    '-c',
    '%u',
    '/bin/sh',
  ]
  const ps = await dockerCommand(options, pluginInstance)
  return ps.stdoutBuffer.toString().trim()
}

export { buildImage, getBindPath, getDockerUid }
