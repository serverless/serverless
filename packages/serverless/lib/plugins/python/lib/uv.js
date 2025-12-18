import fse from 'fs-extra'
import path from 'path'
import spawn from 'child-process-ext/spawn.js'
import semver from 'semver'
import { ServerlessError } from '@serverless/util'

async function getUvVersion(pluginInstance) {
  try {
    const res = await spawn('uv', ['--version'], {
      cwd: pluginInstance.servicePath,
    })
    const stdoutBuffer =
      (res.stdoutBuffer && res.stdoutBuffer.toString().trim()) || ''
    const version = stdoutBuffer.split(' ')[1]
    if (semver.valid(version)) return version
    throw new ServerlessError(
      `Unable to parse uv version!`,
      'PYTHON_REQUIREMENTS_UV_VERSION_ERROR',
    )
  } catch (e) {
    const stderr = (e.stderrBuffer && e.stderrBuffer.toString()) || ''
    const stdout = (e.stdoutBuffer && e.stdoutBuffer.toString()) || ''
    const code = e && e.code
    const message = (e && e.message) || ''
    // Detect missing executable (ENOENT) across platforms
    if (
      code === 'ENOENT' ||
      message.includes('ENOENT') ||
      stderr.includes('command not found') ||
      stdout.includes('command not found') ||
      // Windows-style message if a shell were involved
      stderr.includes('is not recognized as an internal or external command') ||
      stdout.includes('is not recognized as an internal or external command')
    ) {
      throw new ServerlessError(
        `uv not found! Install it according to the uv docs.`,
        'PYTHON_REQUIREMENTS_UV_NOT_FOUND',
        { stack: false },
      )
    }
    throw e
  }
}

async function uvToRequirements(pluginInstance) {
  const { servicePath, options, serverless, log, progress } = pluginInstance

  if (!options.useUv) return

  const moduleProjectPath = servicePath
  const uvLockPath = path.join(moduleProjectPath, 'uv.lock')
  if (!fse.existsSync(uvLockPath)) return

  let generateRequirementsProgress
  if (progress && log) {
    generateRequirementsProgress = progress.get(
      'python-generate-requirements-uv',
    )
    generateRequirementsProgress.update(
      'Generating requirements.txt from uv.lock',
    )
    log.info('Generating requirements.txt from uv.lock')
  } else {
    serverless.cli.log('Generating requirements.txt from uv.lock...')
  }

  try {
    await getUvVersion(pluginInstance)
    fse.ensureDirSync(path.join(servicePath, '.serverless'))
    const outPath = path.join(servicePath, '.serverless', 'requirements.txt')
    await spawn(
      'uv',
      ['export', '--no-dev', '--frozen', '--no-hashes', '-o', outPath],
      { cwd: moduleProjectPath },
    )
  } finally {
    generateRequirementsProgress && generateRequirementsProgress.remove()
  }
}

export { uvToRequirements, getUvVersion }
