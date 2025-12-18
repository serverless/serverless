import fse from 'fs-extra'
import path from 'path'
import spawn from 'child-process-ext/spawn.js'
import { EOL } from 'os'
import semver from 'semver'
import { ServerlessError } from '@serverless/util'

const LEGACY_PIPENV_VERSION = '2022.8.5'

async function getPipenvVersion(pluginInstance) {
  try {
    const res = await spawn('pipenv', ['--version'], {
      cwd: pluginInstance.servicePath,
    })

    const stdoutBuffer =
      (res.stdoutBuffer && res.stdoutBuffer.toString().trim()) || ''

    const version = stdoutBuffer.split(' ')[2]

    if (semver.valid(version)) {
      return version
    } else {
      throw new ServerlessError(
        `Unable to parse pipenv version!`,
        'PYTHON_REQUIREMENTS_PIPENV_VERSION_ERROR',
      )
    }
  } catch (e) {
    const stderrBufferContent =
      (e.stderrBuffer && e.stderrBuffer.toString()) || ''

    if (stderrBufferContent.includes('command not found')) {
      throw new ServerlessError(
        `pipenv not found! Install it according to the pipenv docs.`,
        'PYTHON_REQUIREMENTS_PIPENV_NOT_FOUND',
        { stack: false },
      )
    } else {
      throw e
    }
  }
}

/**
 * pipenv install
 */
async function pipfileToRequirements() {
  if (
    !this.options.usePipenv ||
    !fse.existsSync(path.join(this.servicePath, 'Pipfile'))
  ) {
    return
  }

  let generateRequirementsProgress
  if (this.progress && this.log) {
    generateRequirementsProgress = this.progress.get(
      'python-generate-requirements-pipfile',
    )
    generateRequirementsProgress.update(
      'Generating requirements.txt from Pipfile',
    )
    this.log.info('Generating requirements.txt from Pipfile')
  } else {
    this.serverless.cli.log('Generating requirements.txt from Pipfile...')
  }

  try {
    // Get and validate pipenv version
    if (this.log) {
      this.log.info('Getting pipenv version')
    } else {
      this.serverless.cli.log('Getting pipenv version')
    }

    const pipenvVersion = await getPipenvVersion(this)
    let res

    if (semver.gt(pipenvVersion, LEGACY_PIPENV_VERSION)) {
      // Using new pipenv syntax ( >= 2022.8.13)
      // Generate requirements from existing lock file.
      // See: https://pipenv.pypa.io/en/latest/advanced/#generating-a-requirements-txt
      try {
        res = await spawn('pipenv', ['requirements'], {
          cwd: this.servicePath,
        })
      } catch (e) {
        const stderrBufferContent =
          (e.stderrBuffer && e.stderrBuffer.toString()) || ''
        if (stderrBufferContent.includes('FileNotFoundError')) {
          // No previous Pipfile.lock, we will try to generate it here
          if (this.log) {
            this.log.warning(
              'No Pipfile.lock found! Review https://pipenv.pypa.io/en/latest/pipfile/ for recommendations.',
            )
          } else {
            this.serverless.cli.log(
              'WARNING: No Pipfile.lock found! Review https://pipenv.pypa.io/en/latest/pipfile/ for recommendations.',
            )
          }
          await spawn('pipenv', ['lock'], {
            cwd: this.servicePath,
          })
          res = await spawn('pipenv', ['requirements'], {
            cwd: this.servicePath,
          })
        } else {
          throw e
        }
      }
    } else {
      // Falling back to legacy pipenv syntax
      res = await spawn(
        'pipenv',
        ['lock', '--requirements', '--keep-outdated'],
        {
          cwd: this.servicePath,
        },
      )
    }

    fse.ensureDirSync(path.join(this.servicePath, '.serverless'))
    fse.writeFileSync(
      path.join(this.servicePath, '.serverless/requirements.txt'),
      removeEditableFlagFromRequirementsString(res.stdoutBuffer),
    )
  } finally {
    generateRequirementsProgress && generateRequirementsProgress.remove()
  }
}

/**
 *
 * @param requirementBuffer
 * @returns Buffer with editable flags remove
 */
function removeEditableFlagFromRequirementsString(requirementBuffer) {
  const flagStr = '-e '
  const lines = requirementBuffer.toString('utf8').split(EOL)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(flagStr)) {
      lines[i] = lines[i].substring(flagStr.length)
    }
  }
  return Buffer.from(lines.join(EOL))
}

export { pipfileToRequirements }
