import fse from 'fs-extra'
import path from 'path'
import spawn from 'child-process-ext/spawn.js'
import shellQuote from 'shell-quote'
import os from 'os'
import { ServerlessError } from '@serverless/util'
import { buildImage, getBindPath, getDockerUid } from './docker.js'
import { deleteFiles, getStripCommand, getStripMode } from './slim.js'
import { isPoetryProject, pyprojectTomlToRequirements } from './poetry.js'
import { getUvVersion } from './uv.js'
import tomlParse from '@iarna/toml/parse-string.js'
import {
  checkForAndDeleteMaxCacheVersions,
  getRequirementsWorkingPath,
  getUserCachePath,
  sha256Path,
} from './shared.js'

const { quote } = shellQuote

const SAM_IMAGE_PREFIX = 'public.ecr.aws/sam/build-'

function isSamBuildImage(image) {
  if (!image) return false
  return image.startsWith(SAM_IMAGE_PREFIX)
}

function prependUvBootstrapCommands(pipCmds) {
  pipCmds.unshift(['source', '~/.local/bin/env'])
  pipCmds.unshift([
    '/bin/sh',
    '-c',
    'curl -LsSf https://astral.sh/uv/install.sh | sh',
  ])
}

/**
 * Omit empty commands.
 * In this context, a "command" is a list of arguments. An empty list or falsy value is ommitted.
 * @param {string[][]} many commands to merge.
 * @return {string[][]} a list of valid commands.
 */
function filterCommands(commands) {
  return commands.filter((cmd) => Boolean(cmd) && cmd.length > 0)
}

/**
 * Render zero or more commands as a single command for a Unix environment.
 * In this context, a "command" is a list of arguments. An empty list or falsy value is ommitted.
 *
 * @param {string[][]} many commands to merge.
 * @return {string[]} a single list of words.
 */
function mergeCommands(commands) {
  const cmds = filterCommands(commands)
  if (cmds.length === 0) {
    throw new Error('Expected at least one non-empty command')
  } else if (cmds.length === 1) {
    return cmds[0]
  } else {
    // Quote the arguments in each command and join them all using &&.
    const script = cmds.map(quote).join(' && ')
    return ['/bin/sh', '-c', script]
  }
}

/**
 * Just generate the requirements file in the .serverless folder
 * @param {string} requirementsPath
 * @param {string} targetFile
 * @param {Object} serverless
 * @param {string} servicePath
 * @param {Object} options
 * @return {undefined}
 */
function generateRequirementsFile(
  requirementsPath,
  targetFile,
  pluginInstance,
) {
  const { serverless, servicePath, options, log } = pluginInstance
  const modulePath = path.dirname(requirementsPath)
  if (options.usePoetry && isPoetryProject(modulePath)) {
    filterRequirementsFile(targetFile, targetFile, pluginInstance)
    if (log) {
      log.info(`Parsed requirements.txt from pyproject.toml in ${targetFile}`)
    } else {
      serverless.cli.log(
        `Parsed requirements.txt from pyproject.toml in ${targetFile}...`,
      )
    }
  } else if (
    options.usePipenv &&
    fse.existsSync(path.join(servicePath, 'Pipfile'))
  ) {
    filterRequirementsFile(
      path.join(servicePath, '.serverless/requirements.txt'),
      targetFile,
      pluginInstance,
    )
    if (log) {
      log.info(`Parsed requirements.txt from Pipfile in ${targetFile}`)
    } else {
      serverless.cli.log(
        `Parsed requirements.txt from Pipfile in ${targetFile}...`,
      )
    }
  } else if (
    options.useUv &&
    fse.existsSync(path.join(servicePath, 'uv.lock'))
  ) {
    filterRequirementsFile(
      path.join(servicePath, '.serverless/requirements.txt'),
      targetFile,
      pluginInstance,
    )
    if (log) {
      log.info(`Parsed requirements.txt from uv.lock in ${targetFile}`)
    } else {
      serverless.cli.log(
        `Parsed requirements.txt from uv.lock in ${targetFile}...`,
      )
    }
  } else {
    filterRequirementsFile(requirementsPath, targetFile, pluginInstance)
    if (log) {
      log.info(
        `Generated requirements from ${requirementsPath} in ${targetFile}`,
      )
    } else {
      serverless.cli.log(
        `Generated requirements from ${requirementsPath} in ${targetFile}...`,
      )
    }
  }
}

async function pipAcceptsSystem(pythonBin, pluginInstance) {
  // Check if pip has Debian's --system option and set it if so
  try {
    const pipTestRes = await spawn(pythonBin, ['-m', 'pip', 'help', 'install'])
    return (
      pipTestRes.stdoutBuffer &&
      pipTestRes.stdoutBuffer.toString().indexOf('--system') >= 0
    )
  } catch (e) {
    if (
      e.stderrBuffer &&
      e.stderrBuffer.toString().includes('command not found')
    ) {
      throw new ServerlessError(
        `${pythonBin} not found! Install it according to the poetry docs.`,
        'PYTHON_REQUIREMENTS_PYTHON_NOT_FOUND',
        { stack: false },
      )
    }
    throw e
  }
}

/**
 * Install requirements described from requirements in the targetFolder into that same targetFolder
 * @param {string} targetFolder
 * @param {Object} pluginInstance
 * @param {Object} funcOptions
 * @return {undefined}
 */
async function installRequirements(targetFolder, pluginInstance, funcOptions) {
  const { options, serverless, log, progress, dockerImageForFunction } =
    pluginInstance
  const targetRequirementsTxt = path.join(targetFolder, 'requirements.txt')

  let installProgress
  if (progress) {
    log.info(`Installing requirements from "${targetRequirementsTxt}"`)
    installProgress = progress.get('python-install')
    installProgress.update('Installing requirements')
  } else {
    serverless.cli.log(
      `Installing requirements from ${targetRequirementsTxt} ...`,
    )
  }

  try {
    const dockerCmd = []

    // Decide installer (pip or uv). Default: pip unless user selects uv.
    // If installer === 'uv', we require uv to be present.
    const usingUv = options.installer === 'uv'
    if (usingUv && !options.dockerizePip) {
      // Will throw a helpful error if uv is not available
      await getUvVersion(pluginInstance)
    }

    const pipCmd = usingUv
      ? ['uv', 'pip', 'install']
      : [options.pythonBin, '-m', 'pip', 'install']

    const extraArgs = options.pipCmdExtraArgs
    if (Array.isArray(extraArgs) && extraArgs.length > 0) {
      extraArgs.forEach((cmd) => {
        const parts = cmd.split(/\s+/, 2)
        pipCmd.push(...parts)
      })
    }

    // uv caches local packages (e.g. -e .).
    // Passing --reinstall-package for local packages prevents stale deployments.
    // See: https://github.com/astral-sh/uv/issues/13876
    if (usingUv) {
      const localPackages = getLocalPackagesFromRequirements(
        targetRequirementsTxt,
        pluginInstance.servicePath,
      )

      for (const name of localPackages) {
        pipCmd.push('--reinstall-package', name)
        if (log) {
          log.info(`Force reinstalling local package: ${name}`)
        }
      }
    }

    const pipCmds = [pipCmd]
    const postCmds = []
    // Check if we're using the legacy --cache-dir command...
    if (options.pipCmdExtraArgs.indexOf('--cache-dir') > -1) {
      if (options.dockerizePip) {
        throw new ServerlessError(
          'You cannot use --cache-dir with Docker any more, please use the new option useDownloadCache instead. Please see: https://github.com/UnitedIncome/serverless-python-requirements#caching for more details.',
          'PYTHON_REQUIREMENTS_CACHE_DIR_DOCKER_INVALID',
          { stack: false },
        )
      } else {
        if (log) {
          log.warning(
            'You are using a deprecated --cache-dir inside\n' +
              '            your pipCmdExtraArgs which may not work properly, please use the\n' +
              '            useDownloadCache option instead.  Please see: \n' +
              '            https://github.com/UnitedIncome/serverless-python-requirements#caching',
          )
        } else {
          serverless.cli.log(
            '==================================================',
          )
          serverless.cli.log(
            'Warning: You are using a deprecated --cache-dir inside\n' +
              '            your pipCmdExtraArgs which may not work properly, please use the\n' +
              '            useDownloadCache option instead.  Please see: \n' +
              '            https://github.com/UnitedIncome/serverless-python-requirements#caching',
          )
          serverless.cli.log(
            '==================================================',
          )
        }
      }
    }

    // Add ARM64 platform flags for AgentCore agents
    // AgentCore always runs on Linux ARM64, so we need cross-platform binaries
    if (funcOptions.isAgent && funcOptions.architecture === 'arm64') {
      if (log) {
        log.info('Using ARM64 platform for AgentCore agent requirements')
      }
      // Extract Python version from agent runtime for cross-compilation.
      // Handles both user-facing format (python3.13) and CF format (PYTHON_3_13).
      const agentRuntime = funcOptions.config?.runtime || 'python3.13'
      const pythonVersion = agentRuntime
        .toLowerCase()
        .replace(/^python/, '')
        .replace(/^_/, '')
        .replace(/_/g, '.')

      pipCmd.push(
        '--platform',
        'manylinux2014_aarch64',
        '--implementation',
        'cp',
        '--python-version',
        pythonVersion,
        '--only-binary=:all:',
      )
    }

    if (!options.dockerizePip) {
      // Push our local OS-specific paths for requirements and target directory
      pipCmd.push(
        '--target',
        dockerPathForWin(targetFolder),
        '-r',
        dockerPathForWin(targetRequirementsTxt),
      )
      // If we want a download cache...
      if (options.useDownloadCache) {
        const downloadCacheDir = path.join(
          getUserCachePath(options),
          'downloadCacheslspyc',
        )
        if (log) {
          log.info(`Using download cache directory ${downloadCacheDir}`)
        } else {
          serverless.cli.log(
            `Using download cache directory ${downloadCacheDir}`,
          )
        }
        fse.ensureDirSync(downloadCacheDir)
        pipCmd.push('--cache-dir', downloadCacheDir)
      }

      if (!usingUv) {
        if (await pipAcceptsSystem(options.pythonBin, pluginInstance)) {
          pipCmd.push('--system')
        }
      }
    }

    // If we are dockerizing pip
    if (options.dockerizePip) {
      // Push docker-specific paths for requirements and target directory
      pipCmd.push('--target', '/var/task/', '-r', '/var/task/requirements.txt')

      // Build docker image if required
      let dockerImage
      if (options.dockerFile) {
        let buildDockerImageProgress
        if (progress) {
          buildDockerImageProgress = progress.get('python-install-build-docker')
          buildDockerImageProgress.update(
            `Building custom docker image from ${options.dockerFile}`,
          )
        } else {
          serverless.cli.log(
            `Building custom docker image from ${options.dockerFile}...`,
          )
        }
        try {
          dockerImage = await buildImage(
            options.dockerFile,
            options.dockerBuildCmdExtraArgs,
            pluginInstance,
          )
        } finally {
          buildDockerImageProgress && buildDockerImageProgress.remove()
        }
      } else {
        dockerImage = dockerImageForFunction(funcOptions)
      }
      const shouldAutoInstallUvInDocker =
        usingUv && isSamBuildImage(dockerImage)
      if (log) {
        log.info(`Docker Image: ${dockerImage}`)
      } else {
        serverless.cli.log(`Docker Image: ${dockerImage}`)
      }

      // Prepare bind path depending on os platform
      const bindPath = dockerPathForWin(
        await getBindPath(targetFolder, pluginInstance),
      )

      dockerCmd.push('docker', 'run', '--rm', '-v', `${bindPath}:/var/task:z`)
      if (options.dockerSsh) {
        const homePath = os.homedir()
        const sshKeyPath = options.dockerPrivateKey || `${homePath}/.ssh/id_rsa`

        // Mount necessary ssh files to work with private repos
        dockerCmd.push(
          '-v',
          `${sshKeyPath}:/root/.ssh/${sshKeyPath.split('/').splice(-1)[0]}:z`,
          '-v',
          `${homePath}/.ssh/known_hosts:/root/.ssh/known_hosts:z`,
          '-v',
          `${process.env.SSH_AUTH_SOCK}:/tmp/ssh_sock:z`,
          '-e',
          'SSH_AUTH_SOCK=/tmp/ssh_sock',
        )
      }

      if (shouldAutoInstallUvInDocker) {
        prependUvBootstrapCommands(pipCmds)
      }

      // If we want a download cache...
      const dockerDownloadCacheDir = '/var/useDownloadCache'
      if (options.useDownloadCache) {
        const downloadCacheDir = path.join(
          getUserCachePath(options),
          'downloadCacheslspyc',
        )
        if (log) {
          log.info(`Using download cache directory ${downloadCacheDir}`)
        } else {
          serverless.cli.log(
            `Using download cache directory ${downloadCacheDir}`,
          )
        }
        fse.ensureDirSync(downloadCacheDir)
        // This little hack is necessary because getBindPath requires something inside of it to test...
        // Ugh, this is so ugly, but someone has to fix getBindPath in some other way (eg: make it use
        // its own temp file)
        fse.closeSync(
          fse.openSync(path.join(downloadCacheDir, 'requirements.txt'), 'w'),
        )
        const windowsized = await getBindPath(downloadCacheDir, pluginInstance)
        // And now push it to a volume mount and to pip...
        dockerCmd.push('-v', `${windowsized}:${dockerDownloadCacheDir}:z`)
        pipCmd.push('--cache-dir', dockerDownloadCacheDir)
      }

      if (options.dockerEnv) {
        // Add environment variables to docker run cmd
        options.dockerEnv.forEach(function (item) {
          dockerCmd.push('-e', item)
        })
      }

      if (process.platform === 'linux') {
        // Use same user so requirements folder is not root and so --cache-dir works
        if (options.useDownloadCache) {
          // Set the ownership of the download cache dir to root
          pipCmds.unshift(['chown', '-R', '0:0', dockerDownloadCacheDir])
        }
        // Install requirements with pip
        // Set the ownership of the current folder to user
        // If you use docker-rootless, you don't need to set the ownership
        if (options.dockerRootless !== true) {
          pipCmds.push([
            'chown',
            '-R',
            `${process.getuid()}:${process.getgid()}`,
            '/var/task',
          ])
        } else {
          pipCmds.push(['chown', '-R', '0:0', '/var/task'])
        }
      } else {
        // Use same user so --cache-dir works
        dockerCmd.push('-u', await getDockerUid(bindPath, pluginInstance))
      }

      for (let path of options.dockerExtraFiles) {
        pipCmds.push(['cp', path, '/var/task/'])
      }

      if (process.platform === 'linux') {
        if (options.useDownloadCache) {
          // Set the ownership of the download cache dir back to user
          if (options.dockerRootless !== true) {
            pipCmds.push([
              'chown',
              '-R',
              `${process.getuid()}:${process.getgid()}`,
              dockerDownloadCacheDir,
            ])
          } else {
            pipCmds.push(['chown', '-R', '0:0', dockerDownloadCacheDir])
          }
        }
      }

      if (Array.isArray(options.dockerRunCmdExtraArgs)) {
        dockerCmd.push(...options.dockerRunCmdExtraArgs)
      } else {
        throw new ServerlessError(
          'dockerRunCmdExtraArgs option must be an array',
          'PYTHON_REQUIREMENTS_INVALID_DOCKER_EXTRA_ARGS',
          { stack: false },
        )
      }

      dockerCmd.push(dockerImage)
    }

    // If enabled slimming, strip so files
    switch (getStripMode(options)) {
      case 'docker':
        pipCmds.push(getStripCommand(options, '/var/task'))
        break
      case 'direct':
        postCmds.push(getStripCommand(options, dockerPathForWin(targetFolder)))
        break
    }

    let spawnArgs = { shell: true }
    if (process.env.SLS_DEBUG) {
      spawnArgs.stdio = 'inherit'
    }
    let mainCmds = []
    if (dockerCmd.length) {
      dockerCmd.push(...mergeCommands(pipCmds))
      mainCmds = [dockerCmd]
    } else {
      mainCmds = pipCmds
    }
    mainCmds.push(...postCmds)

    for (const [cmd, ...args] of mainCmds) {
      // Log the exact command about to be executed
      const rendered = quote([cmd, ...args])
      if (log) {
        log.info(`Running: ${rendered}`)
      } else {
        serverless.cli.log(`Running: ${rendered}`)
      }
      try {
        await spawn(cmd, args)
      } catch (e) {
        const stderr = (e.stderrBuffer && e.stderrBuffer.toString()) || ''
        const stdout = (e.stdoutBuffer && e.stdoutBuffer.toString()) || ''
        const mentionsCommandNotFound =
          stderr.includes('command not found') ||
          stdout.includes('command not found')
        if (cmd !== 'docker' && mentionsCommandNotFound) {
          const advice =
            cmd.indexOf('python') > -1
              ? 'Try the pythonBin option'
              : 'Please install it'
          throw new ServerlessError(
            `${cmd} not found! ${advice}`,
            'PYTHON_REQUIREMENTS_COMMAND_NOT_FOUND',
            { stack: false },
          )
        }

        if (cmd === 'docker') {
          const lines = [
            `Running "${cmd} ${args.join(' ')}" failed.`,
            stderr && `Error: ${stderr.trim()}`,
            stdout && `Command output: ${stdout.trim()}`,
          ].filter(Boolean)
          throw new ServerlessError(
            lines.join('\n'),
            'PYTHON_REQUIREMENTS_DOCKER_COMMAND_FAILED',
            { stack: false },
          )
        }

        if (log) {
          log.error(`Stdout: ${e.stdoutBuffer}`)
          log.error(`Stderr: ${e.stderrBuffer}`)
        } else {
          serverless.cli.log(`Stdout: ${e.stdoutBuffer}`)
          serverless.cli.log(`Stderr: ${e.stderrBuffer}`)
        }
        throw e
      }
    }
    // If enabled slimming, delete files in slimPatterns
    if (options.slim === true || options.slim === 'true') {
      deleteFiles(options, targetFolder)
    }
  } finally {
    installProgress && installProgress.remove()
  }
}

/**
 * Convert path from Windows style to Linux style, if needed.
 * @param {string} path
 * @return {string}
 */
function dockerPathForWin(path) {
  if (process.platform === 'win32') {
    return path.replace(/\\/g, '/')
  } else {
    return path
  }
}

/**
 * Read package name from pyproject.toml for a local package.
 * @param {string} packagePath - Absolute path to the package directory
 * @return {string|null} Package name or null if not found
 */
function getPackageNameFromPyproject(packagePath) {
  const pyprojectPath = path.join(packagePath, 'pyproject.toml')
  if (!fse.existsSync(pyprojectPath)) return null

  try {
    const content = fse.readFileSync(pyprojectPath, 'utf-8')
    const pyproject = tomlParse(content)
    return pyproject.project?.name || null
  } catch (e) {
    // Gracefully handle invalid TOML or missing project.name
    return null
  }
}

/**
 * Resolves local package names from requirements.txt to enable force reinstall with uv.
 * @param {string} requirementsPath - Path to requirements.txt
 * @param {string} servicePath - Base service path
 * @return {string[]} Array of local package names
 */
function getLocalPackagesFromRequirements(requirementsPath, servicePath) {
  if (!fse.existsSync(requirementsPath)) return []

  return getRequirements(requirementsPath)
    .map((req) => req.split('#')[0].trim().replace(/\\/g, '/')) // Strip comments and normalize separator
    .filter(
      (req) =>
        req === '.' ||
        req === '..' ||
        req.startsWith('./') ||
        req.startsWith('../'),
    )
    .map((normalizedPath) => {
      const fullPath = path.resolve(servicePath, normalizedPath)
      if (fse.existsSync(fullPath) && fse.statSync(fullPath).isDirectory()) {
        return getPackageNameFromPyproject(fullPath)
      }
      return null
    })
    .filter(Boolean)
}

/**
 * get requirements from requirements.txt
 * @param {string} source
 * @return {string[]}
 */
function getRequirements(source) {
  const requirements = fse
    .readFileSync(source, { encoding: 'utf-8' })
    .replace(/\\\n/g, ' ')
    .split(/\r?\n/)

  return requirements.reduce((acc, req) => {
    req = req.trim()
    if (!req.startsWith('-r')) {
      return [...acc, req]
    }
    source = path.join(path.dirname(source), req.replace(/^-r\s+/, ''))
    return [...acc, ...getRequirements(source)]
  }, [])
}

/** create a filtered requirements.txt without anything from noDeploy
 *  then remove all comments and empty lines, and sort the list which
 *  assist with matching the static cache.  The sorting will skip any
 *  lines starting with -- as those are typically ordered at the
 *  start of a file ( eg: --index-url / --extra-index-url ) or any
 *  lines that start with -c, -e, -f, -i or -r,  Please see:
 * https://pip.pypa.io/en/stable/reference/pip_install/#requirements-file-format
 * @param {string} source requirements
 * @param {string} target requirements where results are written
 * @param {Object} options
 */
function filterRequirementsFile(source, target, { options, serverless, log }) {
  const noDeploy = new Set(options.noDeploy || [])
  const requirements = getRequirements(source)
  var prepend = []
  const filteredRequirements = requirements.filter((req) => {
    req = req.trim()
    if (req.startsWith('#')) {
      // Skip comments
      return false
    } else if (
      req.startsWith('--') ||
      req.startsWith('-c') ||
      req.startsWith('-e') ||
      req.startsWith('-f') ||
      req.startsWith('-i') ||
      req.startsWith('-r')
    ) {
      if (req.startsWith('-e')) {
        // strip out editable flags
        // not required inside final archive and avoids pip bugs
        // see https://github.com/UnitedIncome/serverless-python-requirements/issues/240
        req = req.split('-e')[1].trim()
        if (log) {
          log.warning(`Stripping -e flag from requirement ${req}`)
        } else {
          serverless.cli.log(
            `Warning: Stripping -e flag from requirement ${req}`,
          )
        }
      }

      // Keep options for later
      prepend.push(req)
      return false
    } else if (req === '') {
      return false
    }
    return !noDeploy.has(req.split(/[=<> \t]/)[0].trim())
  })
  filteredRequirements.sort() // Sort remaining alphabetically
  // Then prepend any options from above in the same order
  for (let item of prepend.reverse()) {
    if (item && item.length > 0) {
      filteredRequirements.unshift(item)
    }
  }
  fse.writeFileSync(target, filteredRequirements.join('\n') + '\n')
}

/**
 * Copy everything from vendorFolder to targetFolder
 * @param {string} vendorFolder
 * @param {string} targetFolder
 * @param {Object} serverless
 * @return {undefined}
 */
function copyVendors(vendorFolder, targetFolder, { serverless, log }) {
  // Create target folder if it does not exist
  fse.ensureDirSync(targetFolder)

  if (log) {
    log.info(`Copying vendor libraries from ${vendorFolder} to ${targetFolder}`)
  } else {
    serverless.cli.log(
      `Copying vendor libraries from ${vendorFolder} to ${targetFolder}...`,
    )
  }

  fse.readdirSync(vendorFolder).map((file) => {
    let source = path.join(vendorFolder, file)
    let dest = path.join(targetFolder, file)
    if (fse.existsSync(dest)) {
      fse.removeSync(dest)
    }
    fse.copySync(source, dest)
  })
}

/**
 * This checks if requirements file exists.
 * @param {string} servicePath
 * @param {Object} options
 * @param {string} fileName
 */
function requirementsFileExists(servicePath, options, fileName) {
  if (options.usePoetry && isPoetryProject(path.dirname(fileName))) {
    return true
  }

  if (options.usePipenv && fse.existsSync(path.join(servicePath, 'Pipfile'))) {
    return true
  }

  if (options.useUv && fse.existsSync(path.join(servicePath, 'uv.lock'))) {
    return true
  }

  if (fse.existsSync(fileName)) {
    return true
  }

  return false
}

/**
 * This evaluates if requirements are actually needed to be installed, but fails
 * gracefully if no req file is found intentionally.  It also assists with code
 * re-use for this logic pertaining to individually packaged functions
 * @param {string} servicePath
 * @param {string} modulePath
 * @param {Object} options
 * @param {Object} funcOptions
 * @param {Object} serverless
 * @return {string}
 */
async function installRequirementsIfNeeded(
  modulePath,
  funcOptions,
  pluginInstance,
) {
  const { servicePath, options, serverless } = pluginInstance
  // Our source requirements, under our service path, and our module path (if specified)
  const fileName = path.join(servicePath, modulePath, options.fileName)

  await pyprojectTomlToRequirements(modulePath, pluginInstance)

  // Skip requirements generation, if requirements file doesn't exist
  if (!requirementsFileExists(servicePath, options, fileName)) {
    return false
  }

  let requirementsTxtDirectory
  // Copy our requirements to another path in .serverless (incase of individually packaged)
  if (modulePath && modulePath !== '.') {
    requirementsTxtDirectory = path.join(servicePath, '.serverless', modulePath)
  } else {
    requirementsTxtDirectory = path.join(servicePath, '.serverless')
  }
  fse.ensureDirSync(requirementsTxtDirectory)
  const slsReqsTxt = path.join(requirementsTxtDirectory, 'requirements.txt')

  generateRequirementsFile(fileName, slsReqsTxt, pluginInstance)

  // If no requirements file or an empty requirements file, then do nothing
  if (!fse.existsSync(slsReqsTxt) || fse.statSync(slsReqsTxt).size == 0) {
    if (pluginInstance.log) {
      pluginInstance.log.info(
        `Skipping empty output requirements.txt file from ${slsReqsTxt}`,
      )
    } else {
      serverless.cli.log(
        `Skipping empty output requirements.txt file from ${slsReqsTxt}`,
      )
    }
    return false
  }

  // Then generate our MD5 Sum of this requirements file to determine where it should "go" to and/or pull cache from
  const reqChecksum = sha256Path(slsReqsTxt)

  // For agents, use ARM64 architecture override to ensure separate cache from Lambda functions
  const architectureOverride = funcOptions.isAgent
    ? funcOptions.architecture
    : undefined

  // Then figure out where this cache should be, if we're caching, if we're in a module, etc
  const workingReqsFolder = getRequirementsWorkingPath(
    reqChecksum,
    requirementsTxtDirectory,
    options,
    serverless,
    architectureOverride,
  )

  // Check if our static cache is present and is valid
  if (fse.existsSync(workingReqsFolder)) {
    if (
      fse.existsSync(path.join(workingReqsFolder, '.completed_requirements')) &&
      workingReqsFolder.endsWith('_slspyc')
    ) {
      if (pluginInstance.log) {
        pluginInstance.log.info(
          `Using static cache of requirements found at ${workingReqsFolder}`,
        )
      } else {
        serverless.cli.log(
          `Using static cache of requirements found at ${workingReqsFolder} ...`,
        )
      }
      // We'll "touch" the folder, as to bring it to the start of the FIFO cache
      fse.utimesSync(workingReqsFolder, new Date(), new Date())
      return workingReqsFolder
    }
    // Remove our old folder if it didn't complete properly, but _just incase_ only remove it if named properly...
    if (
      workingReqsFolder.endsWith('_slspyc') ||
      workingReqsFolder.endsWith('.requirements')
    ) {
      fse.removeSync(workingReqsFolder)
    }
  }

  // Ensuring the working reqs folder exists
  fse.ensureDirSync(workingReqsFolder)

  // Copy our requirements.txt into our working folder...
  fse.copySync(slsReqsTxt, path.join(workingReqsFolder, 'requirements.txt'))

  // Then install our requirements from this folder
  await installRequirements(workingReqsFolder, pluginInstance, funcOptions)

  // Copy vendor libraries to requirements folder
  if (options.vendor) {
    copyVendors(options.vendor, workingReqsFolder, pluginInstance)
  }
  if (funcOptions.vendor) {
    copyVendors(funcOptions.vendor, workingReqsFolder, pluginInstance)
  }

  // Then touch our ".completed_requirements" file so we know we can use this for static cache
  if (options.useStaticCache) {
    fse.closeSync(
      fse.openSync(
        path.join(workingReqsFolder, '.completed_requirements'),
        'w',
      ),
    )
  }
  return workingReqsFolder
}

/**
 * pip install the requirements to the requirements directory
 * @return {undefined}
 */
async function installAllRequirements() {
  // fse.ensureDirSync(path.join(this.servicePath, '.serverless'));
  // First, check and delete cache versions, if enabled
  checkForAndDeleteMaxCacheVersions(this)

  // Step 1: Get all Python functions and set default module
  const pythonFuncs = this.targetFuncs
    .filter((func) => {
      const runtime = func.runtime || this.serverless.service.provider.runtime
      return runtime && runtime.match(/^python.*/)
    })
    .map((func) => {
      // Default module to '.' if not specified
      if (!func.module) {
        func.module = '.'
      }
      return func
    })

  // Step 2: Separate functions by packaging mode
  // Check BOTH function-level AND service-level package.individually
  const individuallyPackagedFuncs = []
  const sharedPackagedFuncs = []

  for (const func of pythonFuncs) {
    // A function is individually packaged if EITHER:
    // 1. It has package.individually: true at function level, OR
    // 2. The service has package.individually: true at service level
    const isFunctionIndividual = func.package?.individually === true
    const isServiceIndividual =
      this.serverless.service.package?.individually === true

    if (isFunctionIndividual || isServiceIndividual) {
      individuallyPackagedFuncs.push(func)
    } else {
      sharedPackagedFuncs.push(func)
    }
  }

  // Step 3: Install requirements for individually packaged functions
  // Process each unique module once (functions can share modules)
  if (individuallyPackagedFuncs.length > 0) {
    let doneModules = []

    for (const func of individuallyPackagedFuncs) {
      // If we didn't already process this module
      if (!doneModules.includes(func.module)) {
        const reqsInstalledAt = await installRequirementsIfNeeded(
          func.module,
          func,
          this,
        )
        // Add modulePath into .serverless for each module so it's easier for injecting and for users to see where reqs are
        let modulePath = path.join(
          this.servicePath,
          '.serverless',
          `${func.module}`,
          'requirements',
        )
        // Only do if we didn't already do it
        if (
          reqsInstalledAt &&
          !fse.existsSync(modulePath) &&
          reqsInstalledAt != modulePath
        ) {
          if (this.options.useStaticCache) {
            // Windows can't symlink so we have to copy on Windows,
            // it's not as fast, but at least it works
            if (process.platform == 'win32') {
              fse.copySync(reqsInstalledAt, modulePath)
            } else {
              fse.symlink(reqsInstalledAt, modulePath)
            }
          } else {
            fse.rename(reqsInstalledAt, modulePath)
          }
        }
        doneModules.push(func.module)
      }
    }
  }

  // Step 4: Install requirements for shared package
  // Only install if there are Python functions using the shared package
  if (sharedPackagedFuncs.length > 0) {
    const reqsInstalledAt = await installRequirementsIfNeeded('', {}, this)
    // Add symlinks into .serverless for so it's easier for injecting and for users to see where reqs are
    let symlinkPath = path.join(this.servicePath, '.serverless', `requirements`)
    // Only do if we didn't already do it
    if (
      reqsInstalledAt &&
      !fse.existsSync(symlinkPath) &&
      reqsInstalledAt != symlinkPath
    ) {
      // Windows can't symlink so we have to use junction on Windows
      if (process.platform == 'win32') {
        fse.symlink(reqsInstalledAt, symlinkPath, 'junction')
      } else {
        fse.symlink(reqsInstalledAt, symlinkPath)
      }
    }
  }

  // Step 5: Install requirements for agents (always ARM64, always individual)
  const targetAgents = this.targetAgents || []
  if (targetAgents.length > 0) {
    for (const agent of targetAgents) {
      if (this.log) {
        this.log.info(
          `Installing Python requirements for agent "${agent.name}" (ARM64)`,
        )
      }

      const reqsInstalledAt = await installRequirementsIfNeeded(
        agent.module,
        { ...agent, architecture: 'arm64', isAgent: true },
        this,
      )

      // Add requirements into .serverless/agent-{name}/requirements
      let modulePath = path.join(
        this.servicePath,
        '.serverless',
        `agent-${agent.name}`,
        'requirements',
      )

      if (
        reqsInstalledAt &&
        !fse.existsSync(modulePath) &&
        reqsInstalledAt != modulePath
      ) {
        // Ensure parent directory exists
        fse.ensureDirSync(path.dirname(modulePath))

        if (this.options.useStaticCache) {
          if (process.platform == 'win32') {
            fse.copySync(reqsInstalledAt, modulePath)
          } else {
            fse.symlinkSync(reqsInstalledAt, modulePath)
          }
        } else {
          fse.renameSync(reqsInstalledAt, modulePath)
        }
      }
    }
  }
}

export { installAllRequirements }
