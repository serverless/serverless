import fs from 'fs'
import fse from 'fs-extra'
import path from 'path'

import spawn from 'child-process-ext/spawn.js'
import tomlParse from '@iarna/toml/parse-string.js'
import { ServerlessError } from '@serverless/util'

/**
 * poetry install
 */
async function pyprojectTomlToRequirements(modulePath, pluginInstance) {
  const { serverless, servicePath, options, log, progress } = pluginInstance

  const moduleProjectPath = path.join(servicePath, modulePath)
  if (!options.usePoetry || !isPoetryProject(moduleProjectPath)) {
    return
  }

  let generateRequirementsProgress
  if (progress && log) {
    generateRequirementsProgress = progress.get(
      'python-generate-requirements-toml',
    )
  }

  const emitMsg = (msg) => {
    if (generateRequirementsProgress) {
      generateRequirementsProgress.update(msg)
      log.info(msg)
    } else {
      serverless.cli.log(msg)
    }
  }

  if (fs.existsSync('poetry.lock')) {
    emitMsg('Generating requirements.txt from poetry.lock')
  } else {
    if (options.requirePoetryLockFile) {
      throw new ServerlessError(
        'poetry.lock file not found - set requirePoetryLockFile to false to ' +
          'disable this error',
        'MISSING_REQUIRED_POETRY_LOCK',
        { stack: false },
      )
    }
    emitMsg('Generating poetry.lock and requirements.txt from pyproject.toml')
  }

  try {
    try {
      await spawn(
        'poetry',
        [
          'export',
          '--without-hashes',
          '-f',
          'requirements.txt',
          '-o',
          'requirements.txt',
          '--with-credentials',
          ...(options.poetryWithGroups.length
            ? [`--with=${options.poetryWithGroups.join(',')}`]
            : []),
          ...(options.poetryWithoutGroups.length
            ? [`--without=${options.poetryWithoutGroups.join(',')}`]
            : []),
          ...(options.poetryOnlyGroups.length
            ? [`--only=${options.poetryOnlyGroups.join(',')}`]
            : []),
        ],
        {
          cwd: moduleProjectPath,
        },
      )
    } catch (e) {
      if (
        e.stderrBuffer &&
        e.stderrBuffer.toString().includes('command not found')
      ) {
        throw new ServerlessError(
          `poetry not found! Install it according to the poetry docs.`,
          'PYTHON_REQUIREMENTS_POETRY_NOT_FOUND',
          { stack: false },
        )
      }
      throw e
    }

    const editableFlag = new RegExp(/^-e /gm)
    const sourceRequirements = path.join(moduleProjectPath, 'requirements.txt')
    const requirementsContents = fse.readFileSync(sourceRequirements, {
      encoding: 'utf-8',
    })

    if (requirementsContents.match(editableFlag)) {
      if (log) {
        log.info('The generated file contains -e flags, removing them')
      } else {
        serverless.cli.log(
          'The generated file contains -e flags, removing them...',
        )
      }
      fse.writeFileSync(
        sourceRequirements,
        requirementsContents.replace(editableFlag, ''),
      )
    }

    fse.ensureDirSync(path.join(servicePath, '.serverless'))
    fse.moveSync(
      sourceRequirements,
      path.join(servicePath, '.serverless', modulePath, 'requirements.txt'),
      { overwrite: true },
    )
  } finally {
    generateRequirementsProgress && generateRequirementsProgress.remove()
  }
}

/**
 * Check if pyproject.toml file exists and is a poetry project.
 */
function isPoetryProject(servicePath) {
  const pyprojectPath = path.join(servicePath, 'pyproject.toml')

  if (!fse.existsSync(pyprojectPath)) {
    return false
  }

  const pyprojectToml = fs.readFileSync(pyprojectPath)
  const pyproject = tomlParse(pyprojectToml)

  const buildSystemReqs =
    (pyproject['build-system'] && pyproject['build-system']['requires']) || []

  for (var i = 0; i < buildSystemReqs.length; i++) {
    if (buildSystemReqs[i].startsWith('poetry')) {
      return true
    }
  }

  return false
}

export { pyprojectTomlToRequirements, isPoetryProject }
