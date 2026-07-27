import crossSpawn from 'cross-spawn'
import { globSync } from 'glob'
import JSZip from 'jszip'
import sha256File from 'sha256-file'
import Appdir from 'appdirectory'

import fsExtra from 'fs-extra'
import shellQuote from 'shell-quote'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const {
  chmodSync,
  removeSync,
  readFile,
  copySync,
  writeFileSync,
  statSync,
  pathExistsSync,
} = fsExtra
const { quote } = shellQuote

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * The static cache path that will be used for this system + options, used if static cache is enabled
 * @param  {Object} options
 * @return {string}
 */
function getUserCachePath(options) {
  // If we've manually set the static cache location
  if (options && options.cacheLocation) {
    return resolve(options.cacheLocation)
  }

  // Otherwise, find/use the python-ey appdirs cache location
  const dirs = new Appdir({
    appName: 'serverless-python-requirements',
    appAuthor: 'UnitedIncome',
  })
  return dirs.userCache()
}

/**
 * Helper to get the md5 a a file's contents to determine if a requirements has a static cache
 * @param  {string} fullpath
 * @return {string}
 */
function sha256Path(fullpath) {
  return sha256File(fullpath)
}

const initialWorkingDir = __dirname

const mkCommand =
  (cmd) =>
  (args, options = {}) => {
    options['env'] = Object.assign(
      { SERVERLESS_PLATFORM_STAGE: 'dev' },
      process.env,
      options['env'],
    )
    const { error, stdout, stderr, status } = crossSpawn.sync(
      cmd,
      args,
      options,
    )
    if (error && !options['noThrow']) {
      console.error(`Error running: ${quote([cmd, ...args])}`)
      throw error
    }
    if (status && !options['noThrow']) {
      console.error('STDOUT: ', stdout.toString())
      console.error('STDERR: ', stderr.toString())
      throw new Error(
        `${quote([cmd, ...args])} failed with status code ${status}`,
      )
    }
    return {
      stdout: stdout && stdout.toString().trim(),
      stderr: stderr && stderr.toString().trim(),
    }
  }

const sls = mkCommand('sls')
const git = mkCommand('git')
const perl = mkCommand('perl')
const npm = mkCommand('npm')

const setup = () => {
  removeSync(getUserCachePath())
  process.chdir(initialWorkingDir)
}

const teardown = () => {
  const cwd = process.cwd()
  if (!cwd.startsWith(initialWorkingDir)) {
    throw new Error(`Somehow cd'd into ${cwd}`)
  }
  if (cwd != initialWorkingDir) {
    ;[
      'puck',
      'puck2',
      'puck3',
      'node_modules',
      '.serverless',
      '.requirements.zip',
      '.requirements-cache',
      'foobar',
      'package-lock.json',
      'slimPatterns.yml',
      'serverless.yml.bak',
      'module1/foobar',
      getUserCachePath(),
      ...globSync('serverless-python-requirements-*.tgz'),
    ].map((path) => removeSync(path))
    if (!cwd.endsWith('base with a space')) {
      try {
        git(['checkout', 'serverless.yml'])
      } catch (err) {
        console.error(
          `At ${cwd} failed to checkout 'serverless.yml' with ${err}.`,
        )
        throw err
      }
    }
    process.chdir(initialWorkingDir)
  }
  removeSync('tests/base with a space')
}

// Tests run serially within this single file (jest executes tests in a file
// in declaration order), which the suite relies on for the shared cwd and
// static-cache state. To run a subset, use jest's name filter:
// `npm run test:python -w @serverlessinc/sf-core -- -t "<pattern>"`
const test = (desc, func, opts = {}) => {
  ;(opts.skip ? it.skip : it)(desc, async () => {
    setup()
    let testError
    try {
      await func()
    } catch (err) {
      testError = err
    } finally {
      try {
        teardown()
      } catch (err) {
        // Don't mask the test failure with a teardown failure
        if (!testError) testError = err
        else console.error('Teardown failed:', err)
      }
    }
    if (testError) throw testError
  })
}

const availablePythons = (() => {
  const binaries = []
  const mapping = {}
  if (process.env.USE_PYTHON) {
    binaries.push(
      ...process.env.USE_PYTHON.split(',').map((v) => v.toString().trim()),
    )
  } else {
    // For running outside of CI
    binaries.push('python')
  }
  const exe = process.platform === 'win32' ? '.exe' : ''
  for (const bin of binaries) {
    const python = `${bin}${exe}`
    const { stdout, status } = crossSpawn.sync(python, [
      '-c',
      'import sys; sys.stdout.write(".".join(map(str, sys.version_info[:2])))',
    ])
    const ver = stdout && stdout.toString().trim()
    if (!status && ver) {
      for (const recommend of [ver, ver.split('.')[0]]) {
        if (!mapping[recommend]) {
          mapping[recommend] = python
        }
      }
    }
  }
  if (!Object.entries(mapping).length) {
    throw new Error('No pythons found')
  }
  return mapping
})()

const getPythonBin = (version) => {
  const bin = availablePythons[String(version)]
  if (!bin) throw new Error(`No python version ${version} available`)
  return bin
}

const listZipFiles = async function (filename) {
  const file = await readFile(filename)
  const zip = await new JSZip().loadAsync(file)
  return Object.keys(zip.files)
}

const listZipFilesWithMetaData = async function (filename) {
  const file = await readFile(filename)
  const zip = await new JSZip().loadAsync(file)
  return Object(zip.files)
}

const listRequirementsZipFiles = async function (filename) {
  const file = await readFile(filename)
  const zip = await new JSZip().loadAsync(file)
  const reqsBuffer = await zip.file('.requirements.zip').async('nodebuffer')
  const reqsZip = await new JSZip().loadAsync(reqsBuffer)
  return Object.keys(reqsZip.files)
}

const canUseDocker = () => {
  let result
  try {
    result = crossSpawn.sync('docker', ['ps'])
  } catch (e) {
    return false
  }
  return result.status === 0
}

// Skip if running on these platforms.
const brokenOn = (...platforms) => platforms.indexOf(process.platform) != -1

test(
  'dockerPrivateKey option correctly resolves docker command',
  async () => {
    process.chdir('tests/base')
    const { stderr } = sls(['package'], {
      noThrow: true,
      env: {
        dockerizePip: true,
        dockerSsh: true,
        dockerPrivateKey: `${__dirname}${sep}tests${sep}base${sep}custom_ssh`,
        dockerImage: 'break the build to log the command',
      },
    })
    expect(
      stderr.includes(
        `-v ${__dirname}${sep}tests${sep}base${sep}custom_ssh:/root/.ssh/custom_ssh:z`,
      ),
    ).toBeTruthy() // docker command properly resolved
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('default pythonBin can package flask with default options', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('zip entries use forward slashes for paths', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')

  const backslashEntries = zipfiles.filter((f) => f.includes('\\'))
  expect(backslashEntries).toEqual([]) // no zip entries should contain backslashes (ZIP spec requires forward slashes)

  expect(zipfiles.includes('flask/__init__.py')).toBeTruthy() // flask is packaged with forward-slash path

  expect(zipfiles.includes('boto3/__init__.py')).toBeTruthy() // boto3 is packaged with forward-slash path
})

test('layer-only service (no functions) still produces lambda layer', async () => {
  process.chdir('tests/layer_only')
  sls(['package'], { env: {} })

  const cfn = JSON.parse(
    await readFile(
      '.serverless/cloudformation-template-update-stack.json',
      'utf8',
    ),
  )
  expect(cfn.Resources?.PythonRequirementsLambdaLayer).toBeTruthy() // PythonRequirementsLambdaLayer resource is generated

  expect(cfn.Outputs?.PythonRequirementsLambdaLayerQualifiedArn).toBeTruthy() // PythonRequirementsLambdaLayerQualifiedArn output is generated

  const layerZip = await listZipFiles('.serverless/pythonRequirements.zip')
  expect(layerZip.some((p) => p.startsWith('python/six'))).toBeTruthy() // six is packaged into the layer zip
})

test('py3.13 packages have the same hash', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: {} })
  const fileHash = sha256File('.serverless/sls-py-req-test.zip')
  sls(['package'], { env: {} })
  expect(sha256File('.serverless/sls-py-req-test.zip')).toBe(fileHash) // packages have the same hash
})

test('mixed runtimes - shared packaging (no individually)', async () => {
  process.chdir('tests/mixed_runtime_shared')
  npm(['install'])
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify NO individual function zips created (shared packaging)
  expect(pathExistsSync('.serverless/pythonFunction.zip')).toBeFalsy() // no individual package for pythonFunction

  expect(pathExistsSync('.serverless/nodeFunction.zip')).toBeFalsy() // no individual package for nodeFunction

  // Verify shared package exists
  expect(pathExistsSync('.serverless/sls-mixed-rt-shared.zip')).toBeTruthy() // shared service package exists

  // Verify shared package contains Python dependencies but not Node-only artifacts
  const sharedZip = await listZipFiles('.serverless/sls-mixed-rt-shared.zip')
  expect(sharedZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in shared package

  expect(sharedZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in shared package

  expect(sharedZip.includes('index.js')).toBeTruthy() // Node handler is included in shared package

  expect(
    sharedZip.some((p) => p.startsWith('node_modules/lodash/')),
  ).toBeTruthy() // Lodash dependency is included in shared package
})

test('py3.13 can package flask with default options', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test(
  'py3.13 can package flask with hashes',
  async () => {
    process.chdir('tests/base')
    sls(['package'], {
      env: {
        fileName: 'requirements-w-hashes.txt',
        pythonBin: getPythonBin(3),
      },
    })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  },
  { skip: brokenOn('win32') },
)

test('py3.13 can package flask with nested', async () => {
  process.chdir('tests/base')
  sls(['package'], {
    env: {
      fileName: 'requirements-w-nested.txt',
      pythonBin: getPythonBin(3),
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('py3.13 can package flask with zip option', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

  expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own
})

test('py3.13 can package flask with slim option', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { slim: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
  ).toBeTruthy() // __main__.py files are packaged
})

test('py3.13 can package flask with slim & slimPatterns options', async () => {
  process.chdir('tests/base')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test("py3.13 doesn't package bottle with noDeploy option", async () => {
  process.chdir('tests/base')
  perl([
    '-p',
    '-i.bak',
    '-e',
    's/(pythonRequirements:$)/\\1\\n    noDeploy: [bottle]/',
    'serverless.yml',
  ])
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged
})

test('py3.13 can package boto3 with editable', async () => {
  process.chdir('tests/base')
  sls(['package'], {
    env: {
      fileName: 'requirements-w-editable.txt',
      pythonBin: getPythonBin(3),
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  expect(zipfiles.includes(`botocore/__init__.py`)).toBeTruthy() // botocore is packaged
})

test(
  'py3.13 can package flask with dockerizePip option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with slim & dockerizePip option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // *.pyc files are NOT packaged

    expect(
      zipfiles.filter((filename) => filename.endsWith('__main__.py')).length >
        0,
    ).toBeTruthy() // __main__.py files are packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with slim & dockerizePip & slimPatterns options',
  async () => {
    process.chdir('tests/base')
    copySync('_slimPatterns.yml', 'slimPatterns.yml')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // *.pyc files are packaged

    expect(
      zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    ).toEqual([]) // __main__.py files are NOT packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with zip & dockerizePip option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', zip: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    const zippedReqs = await listRequirementsZipFiles(
      '.serverless/sls-py-req-test.zip',
    )
    expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

    expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
    expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own

    expect(zippedReqs.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in the .requirements.zip file
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with zip & slim & dockerizePip option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], {
      env: { dockerizePip: 'true', zip: 'true', slim: 'true' },
    })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    const zippedReqs = await listRequirementsZipFiles(
      '.serverless/sls-py-req-test.zip',
    )
    expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

    expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
    expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own

    expect(zippedReqs.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in the .requirements.zip file
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('pipenv py3.13 can package flask with default options', async () => {
  process.chdir('tests/pipenv')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  expect(zipfiles.includes(`pytest/__init__.py`)).toBeFalsy() // dev-package pytest is NOT packaged
})

test('uv py3.13 can package flask with default options', async () => {
  process.chdir('tests/uv')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('uv py3.13 can package flask with optional dependencies', async () => {
  process.chdir('tests/uv_optional_dependencies')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  expect(zipfiles.includes(`pytest_cov/__init__.py`)).toBeFalsy() // pytest-cov is NOT packaged
})

test('uv py3.13 can package flask with optional groups', async () => {
  process.chdir('tests/uv_optional_groups')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeFalsy() // boto3 is NOT packaged
  expect(zipfiles.includes(`pytest_cov/__init__.py`)).toBeTruthy() // pytest-cov is packaged
})

test('uv py3.13 can package with only groups', async () => {
  process.chdir('tests/uv_only_groups')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeFalsy() // boto3 is NOT packaged
  expect(zipfiles.includes(`pytest_cov/__init__.py`)).toBeTruthy() // pytest-cov is packaged
})

test('uv py3.13 can package with groups and without groups combined', async () => {
  process.chdir('tests/uv_with_without_groups')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeFalsy() // boto3 is NOT packaged
  expect(zipfiles.includes(`pytest_cov/__init__.py`)).toBeFalsy() // pytest-cov is NOT packaged
})

test(
  'uv installer with dockerizePip packages successfully',
  async () => {
    process.chdir('tests/uv_installer')
    const { stderr } = sls(['package'], {
      env: { SLS_DEBUG: '*', dockerizePip: 'true' },
    })

    expect(stderr && stderr.includes('uv pip install')).toBeTruthy() // uv installer used (debug shows uv pip)

    expect(
      stderr && stderr.includes('Stripping -e flag from requirement .'),
    ).toBeFalsy() // no -e stripping warning emitted

    expect(
      stderr &&
        stderr.includes(
          'does not appear to be a Python project, as neither `pyproject.toml` nor `setup.py` are present',
        ),
    ).toBeFalsy() // no root-project metadata error emitted

    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('uv py3.13 can package flask with slim option', async () => {
  process.chdir('tests/uv')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*', slim: 'true' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
  ).toBeTruthy() // __main__.py files are packaged
})

test('uv py3.13 can package flask with slim & slimPatterns options', async () => {
  process.chdir('tests/uv')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*', slim: 'true' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test('uv py3.13 can package flask with zip option', async () => {
  process.chdir('tests/uv')
  const { stderr } = sls(['package'], {
    env: { SLS_DEBUG: '*', zip: 'true', pythonBin: getPythonBin(3) },
  })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

  expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own
})

test('uv py3.13 doesnt package bottle with noDeploy option', async () => {
  process.chdir('tests/uv')
  perl([
    '-p',
    '-i.bak',
    '-e',
    's/(pythonRequirements:$)/\\1\\n    noDeploy: [bottle]/',
    'serverless.yml',
  ])
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  expect(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
  ).toBeTruthy() // uv export used

  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged
})

test('uv_local_package: uv py3.13 excludes root project from requirements export', async () => {
  process.chdir('tests/uv_local_package')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })

  expect(
    stderr && stderr.includes('Stripping -e flag from requirement .'),
  ).toBeFalsy() // no -e stripping warning emitted

  const zipData = await readFile('.serverless/sls-py-req-test.zip')
  const zip = await new JSZip().loadAsync(zipData)
  const files = Object.keys(zip.files).map((f) => f.replace(/\\/g, '/'))

  expect(
    files.some((f) => f.endsWith('my_local_package/__init__.py')),
  ).toBeFalsy() // root package is not injected into artifact

  expect(files.some((f) => f.endsWith('flask/__init__.py'))).toBeTruthy() // flask is packaged
})

test('uv_path_dependency: uv py3.13 auto-reinstalls local path dependency', async () => {
  process.chdir('tests/uv_path_dependency')

  // Initial package of version 1.0.0
  sls(['package'], { env: { SLS_DEBUG: '*' } })

  // Modify source code of local path dependency to version 2.0.0
  const initPyPath = `local_pkg${sep}src${sep}my_path_package${sep}__init__.py`
  const originalContent = await readFile(initPyPath, { encoding: 'utf-8' })
  const newContent = originalContent.replace(
    'VERSION = "1.0.0"',
    'VERSION = "2.0.0"',
  )
  writeFileSync(initPyPath, newContent)

  try {
    // Repackage to verify changes are picked up correctly
    const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })

    expect(
      stderr &&
        stderr.includes('Force reinstalling local package: my-path-package'),
    ).toBeTruthy() // Logs indicate forced reinstall of local path dependency

    const zipData = await readFile('.serverless/sls-py-req-test.zip')
    const zip = await new JSZip().loadAsync(zipData)
    const files = Object.keys(zip.files).map((f) => f.replace(/\\/g, '/'))

    const pathDepFile = files.find((f) =>
      f.endsWith('my_path_package/__init__.py'),
    )
    expect(pathDepFile).toBeTruthy() // my_path_package/__init__.py found in zip

    if (pathDepFile) {
      const content = await zip.file(pathDepFile).async('string')
      expect(content.includes('VERSION = "2.0.0"')).toBeTruthy() // Packaged artifact reflects path dependency source changes
    }

    expect(files.some((f) => f.endsWith('flask/__init__.py'))).toBeTruthy() // flask is packaged
  } finally {
    writeFileSync(initPyPath, originalContent)
  }
})

test('pipenv py3.13 can package flask with slim option', async () => {
  process.chdir('tests/pipenv')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
  ).toBeTruthy() // __main__.py files are packaged
})

test('pipenv py3.13 can package flask with slim & slimPatterns options', async () => {
  process.chdir('tests/pipenv')

  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test('pipenv py3.13 can package flask with zip option', async () => {
  process.chdir('tests/pipenv')
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

  expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own
})

test("pipenv py3.13 doesn't package bottle with noDeploy option", async () => {
  process.chdir('tests/pipenv')
  perl([
    '-p',
    '-i.bak',
    '-e',
    's/(pythonRequirements:$)/\\1\\n    noDeploy: [bottle]/',
    'serverless.yml',
  ])
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged
})

test('non build pyproject.toml uses requirements.txt', async () => {
  process.chdir('tests/non_build_pyproject')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('non build uv project uses requirements.txt when useUv=false', async () => {
  process.chdir('tests/non_build_uv')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('non poetry pyproject.toml without requirements.txt packages handler only', async () => {
  process.chdir('tests/non_poetry_pyproject')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`handler.py`)).toBeTruthy() // handler is packaged
})

test('poetry py3.13 can package flask with default options', async () => {
  process.chdir('tests/poetry')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeTruthy() // bottle is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('poetry py3.13 can package flask with slim option', async () => {
  process.chdir('tests/poetry')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
  ).toBeTruthy() // __main__.py files are packaged
})

test('poetry py3.13 can package flask with slim & slimPatterns options', async () => {
  process.chdir('tests/poetry')

  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test('poetry py3.13 can package flask with zip option', async () => {
  process.chdir('tests/poetry')
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

  expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own
})

test("poetry py3.13 doesn't package bottle with noDeploy option", async () => {
  process.chdir('tests/poetry')
  perl([
    '-p',
    '-i.bak',
    '-e',
    's/(pythonRequirements:$)/\\1\\n    noDeploy: [bottle]/',
    'serverless.yml',
  ])
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged
})

test('py3.13 can package flask with zip option and no explicit include', async () => {
  process.chdir('tests/base')
  perl(['-p', '-i.bak', '-e', 's/include://', 'serverless.yml'])
  perl(['-p', '-i.bak', '-e', 's/^.*handler.py.*$//', 'serverless.yml'])
  sls(['package'], { env: { zip: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

  expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own
})

test('py3.13 can package lambda-decorators using vendor option', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { vendor: './vendor' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  expect(zipfiles.includes(`lambda_decorators.py`)).toBeTruthy() // lambda_decorators.py is packaged
})

test(
  "Don't nuke execute perms",
  async () => {
    process.chdir('tests/base')
    const perm = '755'

    perl([
      '-p',
      '-i.bak',
      '-e',
      's/(handler.py.*$)/$1\n    - foobar/',
      'serverless.yml',
    ])
    writeFileSync(`foobar`, '')
    chmodSync(`foobar`, perm)
    sls(['package'], { env: { vendor: './vendor' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
    expect(zipfiles.includes(`lambda_decorators.py`)).toBeTruthy() // lambda_decorators.py is packaged

    expect(zipfiles.includes(`foobar`)).toBeTruthy() // foobar is packaged

    const zipfiles_with_metadata = await listZipFilesWithMetaData(
      '.serverless/sls-py-req-test.zip',
    )
    expect(
      zipfiles_with_metadata['foobar'].unixPermissions
        .toString(8)
        .slice(3, 6) === perm,
    ).toBeTruthy() // foobar has retained its executable file permissions

    const flaskPerm = statSync('.serverless/requirements/bin/flask').mode
    expect(
      zipfiles_with_metadata['bin/flask'].unixPermissions === flaskPerm,
    ).toBeTruthy() // bin/flask has retained its executable file permissions
  },
  { skip: process.platform === 'win32' },
)

test('py3.13 can package flask in a project with a space in it', async () => {
  copySync('tests/base', 'tests/base with a space')
  process.chdir('tests/base with a space')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test(
  'py3.13 can package flask in a project with a space in it with docker',
  async () => {
    copySync('tests/base', 'tests/base with a space')
    process.chdir('tests/base with a space')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('py3.13 supports custom file name with fileName option', async () => {
  process.chdir('tests/base')
  writeFileSync('puck', 'requests')
  sls(['package'], { env: { fileName: 'puck' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeFalsy() // boto3 is NOT packaged
})

test("py3.13 doesn't package bottle with zip option", async () => {
  process.chdir('tests/base')
  perl([
    '-p',
    '-i.bak',
    '-e',
    's/(pythonRequirements:$)/\\1\\n    noDeploy: [bottle]/',
    'serverless.yml',
  ])
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  const zippedReqs = await listRequirementsZipFiles(
    '.serverless/sls-py-req-test.zip',
  )
  expect(zipfiles.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged

  expect(zipfiles.includes(`unzip_requirements.py`)).toBeTruthy() // unzip util is packaged
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask isn't packaged on its own

  expect(zippedReqs.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in the .requirements.zip file

  expect(zippedReqs.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged in the .requirements.zip file
})

test('py3.13 can package flask with slim, slimPatterns & slimPatternsAppendDefaults=false options', async () => {
  process.chdir('tests/base')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], {
    env: { slim: 'true', slimPatternsAppendDefaults: 'false' },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(
    zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
  ).toBeTruthy() // pyc files are packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test(
  'py3.13 can package flask with slim & dockerizePip & slimPatterns & slimPatternsAppendDefaults=false options',
  async () => {
    process.chdir('tests/base')
    copySync('_slimPatterns.yml', 'slimPatterns.yml')
    sls(['package'], {
      env: {
        dockerizePip: 'true',
        slim: 'true',
        slimPatternsAppendDefaults: 'false',
      },
    })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(
      zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
    ).toBeTruthy() // pyc files are packaged

    expect(
      zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    ).toEqual([]) // __main__.py files are NOT packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('pipenv py3.13 can package flask with slim & slimPatterns & slimPatternsAppendDefaults=false  option', async () => {
  process.chdir('tests/pipenv')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')

  sls(['package'], {
    env: { slim: 'true', slimPatternsAppendDefaults: 'false' },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(
    zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
  ).toBeTruthy() // pyc files are packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test('poetry py3.13 can package flask with slim & slimPatterns & slimPatternsAppendDefaults=false  option', async () => {
  process.chdir('tests/poetry')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')

  sls(['package'], {
    env: { slim: 'true', slimPatternsAppendDefaults: 'false' },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(
    zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
  ).toBeTruthy() // pyc files are packaged

  expect(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
  ).toEqual([]) // __main__.py files are NOT packaged
})

test('poetry py3.13 can package flask with package individually option', async () => {
  process.chdir('tests/poetry_individually')

  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles(
    '.serverless/module1-sls-py-req-test-dev-hello.zip',
  )
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeTruthy() // bottle is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('py3.13 can package flask with package individually option', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true' } })
  const zipfiles_hello = await listZipFiles('.serverless/hello.zip')
  expect(zipfiles_hello.includes(`fn2/__init__.py`)).toBeFalsy() // fn2 is NOT packaged in function hello

  expect(zipfiles_hello.includes('handler.py')).toBeTruthy() // handler.py is packaged in function hello

  expect(zipfiles_hello.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello

  expect(zipfiles_hello.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello

  const zipfiles_hello2 = await listZipFiles('.serverless/hello2.zip')
  expect(zipfiles_hello2.includes(`fn2/__init__.py`)).toBeFalsy() // fn2 is NOT packaged in function hello2

  expect(zipfiles_hello2.includes('handler.py')).toBeTruthy() // handler.py is packaged in function hello2

  expect(zipfiles_hello2.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello2

  expect(zipfiles_hello2.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello2

  const zipfiles_hello3 = await listZipFiles('.serverless/hello3.zip')
  expect(zipfiles_hello3.includes(`fn2/__init__.py`)).toBeFalsy() // fn2 is NOT packaged in function hello3

  expect(zipfiles_hello3.includes('handler.py')).toBeTruthy() // handler.py is packaged in function hello3

  expect(zipfiles_hello3.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello3

  expect(zipfiles_hello3.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello3

  const zipfiles_hello4 = await listZipFiles(
    '.serverless/fn2-sls-py-req-test-dev-hello4.zip',
  )
  expect(zipfiles_hello4.includes(`fn2/__init__.py`)).toBeFalsy() // fn2 is NOT packaged in function hello4

  expect(zipfiles_hello4.includes('fn2_handler.py')).toBeTruthy() // fn2_handler is packaged in the zip-root in function hello4

  expect(zipfiles_hello4.includes(`dataclasses.py`)).toBeTruthy() // dataclasses is packaged in function hello4

  expect(zipfiles_hello4.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello4
})

test('py3.13 can package flask with package individually & slim option', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true', slim: 'true' } })
  const zipfiles_hello = await listZipFiles('.serverless/hello.zip')
  expect(zipfiles_hello.includes('handler.py')).toBeTruthy() // handler.py is packaged in function hello

  expect(
    zipfiles_hello.filter((filename) => filename.endsWith('.pyc')),
  ).toEqual([]) // no pyc files packaged in function hello

  expect(zipfiles_hello.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello

  expect(zipfiles_hello.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello

  const zipfiles_hello2 = await listZipFiles('.serverless/hello2.zip')
  expect(zipfiles_hello2.includes('handler.py')).toBeTruthy() // handler.py is packaged in function hello2

  expect(
    zipfiles_hello2.filter((filename) => filename.endsWith('.pyc')),
  ).toEqual([]) // no pyc files packaged in function hello2

  expect(zipfiles_hello2.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello2

  expect(zipfiles_hello2.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello2

  const zipfiles_hello3 = await listZipFiles('.serverless/hello3.zip')
  expect(zipfiles_hello3.includes('handler.py')).toBeTruthy() // handler.py is packaged in function hello3

  expect(
    zipfiles_hello3.filter((filename) => filename.endsWith('.pyc')),
  ).toEqual([]) // no pyc files packaged in function hello3

  expect(zipfiles_hello3.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello3

  const zipfiles_hello4 = await listZipFiles(
    '.serverless/fn2-sls-py-req-test-dev-hello4.zip',
  )
  expect(zipfiles_hello4.includes('fn2_handler.py')).toBeTruthy() // fn2_handler is packaged in the zip-root in function hello4

  expect(zipfiles_hello4.includes(`dataclasses.py`)).toBeTruthy() // dataclasses is packaged in function hello4

  expect(zipfiles_hello4.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello4

  expect(
    zipfiles_hello4.filter((filename) => filename.endsWith('.pyc')),
  ).toEqual([]) // no pyc files packaged in function hello4
})

test('py3.13 can package only requirements of module', async () => {
  process.chdir('tests/individually')
  sls(['package'], { env: {} })
  const zipfiles_hello = await listZipFiles(
    '.serverless/module1-sls-py-req-test-indiv-dev-hello1.zip',
  )
  expect(zipfiles_hello.includes('handler1.py')).toBeTruthy() // handler1.py is packaged at root level in function hello1

  expect(zipfiles_hello.includes('handler2.py')).toBeFalsy() // handler2.py is NOT packaged at root level in function hello1

  expect(zipfiles_hello.includes(`pyaml/__init__.py`)).toBeTruthy() // pyaml is packaged in function hello1

  expect(zipfiles_hello.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged in function hello1

  expect(zipfiles_hello.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello1

  const zipfiles_hello2 = await listZipFiles(
    '.serverless/module2-sls-py-req-test-indiv-dev-hello2.zip',
  )
  expect(zipfiles_hello2.includes('handler2.py')).toBeTruthy() // handler2.py is packaged at root level in function hello2

  expect(zipfiles_hello2.includes('handler1.py')).toBeFalsy() // handler1.py is NOT packaged at root level in function hello2

  expect(zipfiles_hello2.includes(`pyaml/__init__.py`)).toBeFalsy() // pyaml is NOT packaged in function hello2

  expect(zipfiles_hello2.includes(`boto3/__init__.py`)).toBeFalsy() // boto3 is NOT packaged in function hello2

  expect(zipfiles_hello2.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello2
})

test('py3.13 can package lambda-decorators using vendor and invidiually option', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true', vendor: './vendor' } })
  const zipfiles_hello = await listZipFiles('.serverless/hello.zip')
  expect(zipfiles_hello.includes('handler.py')).toBeTruthy() // handler.py is packaged at root level in function hello

  expect(zipfiles_hello.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello

  expect(zipfiles_hello.includes(`lambda_decorators.py`)).toBeTruthy() // lambda_decorators.py is packaged in function hello

  expect(zipfiles_hello.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello

  const zipfiles_hello2 = await listZipFiles('.serverless/hello2.zip')
  expect(zipfiles_hello2.includes('handler.py')).toBeTruthy() // handler.py is packaged at root level in function hello2

  expect(zipfiles_hello2.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello2

  expect(zipfiles_hello2.includes(`lambda_decorators.py`)).toBeTruthy() // lambda_decorators.py is packaged in function hello2

  expect(zipfiles_hello2.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello2

  const zipfiles_hello3 = await listZipFiles('.serverless/hello3.zip')
  expect(zipfiles_hello3.includes('handler.py')).toBeTruthy() // handler.py is packaged at root level in function hello3

  expect(zipfiles_hello3.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello3

  expect(zipfiles_hello3.includes(`lambda_decorators.py`)).toBeFalsy() // lambda_decorators.py is NOT packaged in function hello3

  expect(zipfiles_hello3.includes(`dataclasses.py`)).toBeFalsy() // dataclasses is NOT packaged in function hello3

  const zipfiles_hello4 = await listZipFiles(
    '.serverless/fn2-sls-py-req-test-dev-hello4.zip',
  )
  expect(zipfiles_hello4.includes('fn2_handler.py')).toBeTruthy() // fn2_handler is packaged in the zip-root in function hello4

  expect(zipfiles_hello4.includes(`dataclasses.py`)).toBeTruthy() // dataclasses is packaged in function hello4

  expect(zipfiles_hello4.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello4
})

test(
  "Don't nuke execute perms when using individually",
  async () => {
    process.chdir('tests/individually')
    const perm = '755'
    writeFileSync(`module1${sep}foobar`, '')
    chmodSync(`module1${sep}foobar`, perm)

    sls(['package'], { env: {} })
    const zipfiles_hello1 = await listZipFilesWithMetaData(
      '.serverless/hello1.zip',
    )

    expect(
      zipfiles_hello1['module1/foobar'].unixPermissions
        .toString(8)
        .slice(3, 6) === perm,
    ).toBeTruthy() // foobar has retained its executable file permissions

    const zipfiles_hello2 = await listZipFilesWithMetaData(
      '.serverless/module2-sls-py-req-test-indiv-dev-hello2.zip',
    )
    const flaskPerm = statSync(
      '.serverless/module2/requirements/bin/flask',
    ).mode

    expect(
      zipfiles_hello2['bin/flask'].unixPermissions === flaskPerm,
    ).toBeTruthy() // bin/flask has retained its executable file permissions
  },
  { skip: process.platform === 'win32' },
)

test(
  "Don't nuke execute perms when using individually w/docker",
  async () => {
    process.chdir('tests/individually')
    const perm = '755'
    writeFileSync(`module1${sep}foobar`, '', { mode: perm })
    chmodSync(`module1${sep}foobar`, perm)

    sls(['package'], { env: { dockerizePip: 'true' } })
    const zipfiles_hello = await listZipFilesWithMetaData(
      '.serverless/hello1.zip',
    )

    expect(
      zipfiles_hello['module1/foobar'].unixPermissions
        .toString(8)
        .slice(3, 6) === perm,
    ).toBeTruthy() // foobar has retained its executable file permissions

    const zipfiles_hello2 = await listZipFilesWithMetaData(
      '.serverless/module2-sls-py-req-test-indiv-dev-hello2.zip',
    )
    const flaskPerm = statSync(
      '.serverless/module2/requirements/bin/flask',
    ).mode

    expect(
      zipfiles_hello2['bin/flask'].unixPermissions === flaskPerm,
    ).toBeTruthy() // bin/flask has retained its executable file permissions
  },
  { skip: !canUseDocker() || process.platform === 'win32' },
)

test(
  'py3.13 can package flask running in docker with module runtime & architecture of function',
  async () => {
    process.chdir('tests/individually_mixed_runtime')

    sls(['package'], {
      env: { dockerizePip: 'true' },
    })

    const zipfiles_hello2 = await listZipFiles(
      '.serverless/module2-sls-py-req-test-indiv-mixed-runtime-dev-hello2.zip',
    )
    expect(zipfiles_hello2.includes('handler2.py')).toBeTruthy() // handler2.py is packaged at root level in function hello2

    expect(zipfiles_hello2.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello2
  },
  {
    skip: !canUseDocker() || process.platform === 'win32',
  },
)

test(
  'py3.13 can package flask succesfully when using mixed architecture, docker and zipping',
  async () => {
    process.chdir('tests/individually_mixed_runtime')
    sls(['package'], { env: { dockerizePip: 'true', zip: 'true' } })

    const zipfiles_hello = await listZipFiles('.serverless/hello1.zip')
    expect(zipfiles_hello.includes(`module1/handler1.ts`)).toBeTruthy() // handler1.ts is packaged in module dir for hello1

    expect(zipfiles_hello.includes('handler2.py')).toBeFalsy() // handler2.py is NOT packaged at root level in function hello1

    expect(zipfiles_hello.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged in function hello1

    const zipfiles_hello2 = await listZipFiles(
      '.serverless/module2-sls-py-req-test-indiv-mixed-runtime-dev-hello2.zip',
    )
    const zippedReqs = await listRequirementsZipFiles(
      '.serverless/module2-sls-py-req-test-indiv-mixed-runtime-dev-hello2.zip',
    )
    expect(zipfiles_hello2.includes('handler2.py')).toBeTruthy() // handler2.py is packaged at root level in function hello2

    expect(zipfiles_hello2.includes(`module1/handler1.ts`)).toBeFalsy() // handler1.ts is NOT included at module1 level in hello2

    expect(zipfiles_hello2.includes(`pyaml/__init__.py`)).toBeFalsy() // pyaml is NOT packaged in function hello2

    expect(zipfiles_hello2.includes(`boto3/__init__.py`)).toBeFalsy() // boto3 is NOT included in zipfile

    expect(zippedReqs.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged in function hello2 in requirements.zip
  },
  { skip: !canUseDocker() || process.platform === 'win32' },
)

test(
  'py3.13 uses download cache by default option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: {} })
    const cachepath = getUserCachePath()
    expect(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
    ).toBeTruthy() // cache directory exists
  },
  { skip: true },
)

test(
  'py3.13 uses download cache by default',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { cacheLocation: '.requirements-cache' } })
    expect(
      pathExistsSync(
        `.requirements-cache${sep}downloadCacheslspyc${sep}http-v2`,
      ),
    ).toBeTruthy() // cache directory exists
  },
  { skip: true },
)

test(
  'py3.13 uses download cache with dockerizePip option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const cachepath = getUserCachePath()
    expect(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
    ).toBeTruthy() // cache directory exists
  },
  // { skip: !canUseDocker() || brokenOn('win32') }
  { skip: true },
)

test(
  'py3.13 uses download cache with dockerizePip by default option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], {
      env: { dockerizePip: 'true', cacheLocation: '.requirements-cache' },
    })
    expect(
      pathExistsSync(
        `.requirements-cache${sep}downloadCacheslspyc${sep}http-v2`,
      ),
    ).toBeTruthy() // cache directory exists
  },
  // { skip: !canUseDocker() || brokenOn('win32') }
  { skip: true },
)

test(
  'py3.13 uses static and download cache',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: {} })
    const cachepath = getUserCachePath()
    const cacheFolderHash = sha256Path('.serverless/requirements.txt')
    const arch = 'x86_64'
    expect(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
    ).toBeTruthy() // http exists in download-cache

    expect(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
      ),
    ).toBeTruthy() // flask exists in static-cache
  },
  { skip: true },
)

test(
  'py3.13 uses static and download cache with dockerizePip option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const cachepath = getUserCachePath()
    const cacheFolderHash = sha256Path('.serverless/requirements.txt')
    const arch = 'x86_64'
    expect(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
    ).toBeTruthy() // http-v2 exists in download-cache

    expect(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
      ),
    ).toBeTruthy() // flask exists in static-cache
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('py3.13 uses static cache', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: {} })
  const cachepath = getUserCachePath()
  const cacheFolderHash = sha256Path('.serverless/requirements.txt')
  const arch = 'x86_64'
  expect(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
    ),
  ).toBeTruthy() // flask exists in static-cache

  expect(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}.completed_requirements`,
    ),
  ).toBeTruthy() // .completed_requirements exists in static-cache

  // py3.13 checking that static cache actually pulls from cache (by poisoning it)
  writeFileSync(
    `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}injected_file_is_bad_form`,
    'injected new file into static cache folder',
  )
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes('injected_file_is_bad_form')).toBeTruthy() // static cache is really used when running 'sls package' again
})

test('py3.13 uses static cache with cacheLocation option', async () => {
  process.chdir('tests/base')
  const cachepath = '.requirements-cache'
  sls(['package'], { env: { cacheLocation: cachepath } })
  const cacheFolderHash = sha256Path('.serverless/requirements.txt')
  const arch = 'x86_64'
  expect(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
    ),
  ).toBeTruthy() // flask exists in static-cache

  expect(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}.completed_requirements`,
    ),
  ).toBeTruthy() // .completed_requirements exists in static-cache
})

test(
  'py3.13 uses static cache with dockerizePip & slim option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const cachepath = getUserCachePath()
    const cacheFolderHash = sha256Path('.serverless/requirements.txt')
    const arch = 'x86_64'
    expect(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
      ),
    ).toBeTruthy() // flask exists in static-cache

    expect(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}.completed_requirements`,
      ),
    ).toBeTruthy() // .completed_requirements exists in static-cache

    // py3.13 checking that static cache actually pulls from cache (by poisoning it)
    writeFileSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}injected_file_is_bad_form`,
      'injected new file into static cache folder',
    )
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes('injected_file_is_bad_form')).toBeTruthy() // static cache is really used when running 'sls package' again

    expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files are packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 uses download cache with dockerizePip & slim option',
  async () => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const cachepath = getUserCachePath()
    expect(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
    ).toBeTruthy() // http-v2 exists in download-cache

    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no pyc files are packaged
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('py3.13 can ignore functions defined with `image`', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true' } })
  expect(pathExistsSync('.serverless/hello.zip')).toBeTruthy() // function hello is packaged
  expect(pathExistsSync('.serverless/hello2.zip')).toBeTruthy() // function hello2 is packaged

  expect(pathExistsSync('.serverless/hello3.zip')).toBeTruthy() // function hello3 is packaged

  expect(pathExistsSync('.serverless/hello4.zip')).toBeTruthy() // function hello4 is packaged

  expect(pathExistsSync('.serverless/hello5.zip')).toBeFalsy() // function hello5 is not packaged
})

test('poetry py3.13 fails packaging if poetry.lock is missing and flag requirePoetryLockFile is set to true', async () => {
  copySync('tests/poetry', 'tests/base with a space')
  process.chdir('tests/base with a space')
  removeSync('poetry.lock')

  const { stderr } = sls(['package'], {
    env: { requirePoetryLockFile: 'true', slim: 'true' },
    noThrow: true,
  })
  expect(
    stderr.includes(
      'poetry.lock file not found - set requirePoetryLockFile to false to disable this error',
    ),
  ).toBeTruthy() // flag works and error is properly reported
})

test('works with provider.runtime not being python', async () => {
  process.chdir('tests/base')
  sls(['package'], { env: { runtime: 'nodejs20.x' } })
  expect(pathExistsSync('.serverless/sls-py-req-test.zip')).toBeTruthy() // sls-py-req-test is packaged
})

test('poetry py3.13 packages additional optional packages', async () => {
  process.chdir('tests/poetry_packages')
  sls(['package'], {
    env: {
      poetryWithGroups: 'poetryWithGroups',
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeTruthy() // bottle is packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('poetry py3.13 skips additional optional packages specified in withoutGroups', async () => {
  process.chdir('tests/poetry_packages')
  sls(['package'], {
    env: {
      poetryWithGroups: 'poetryWithGroups',
      poetryWithoutGroups: 'poetryWithoutGroups',
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeTruthy() // flask is packaged
  expect(zipfiles.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test('poetry py3.13 only installs optional packages specified in onlyGroups', async () => {
  process.chdir('tests/poetry_packages')
  sls(['package'], {
    env: {
      poetryOnlyGroups: 'poetryOnlyGroups',
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  expect(zipfiles.includes(`flask/__init__.py`)).toBeFalsy() // flask is NOT packaged
  expect(zipfiles.includes(`bottle.py`)).toBeFalsy() // bottle is NOT packaged
  expect(zipfiles.includes(`boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
})

test(
  'py3.7 injects dependencies into `package` folder when using scaleway provider',
  async () => {
    process.chdir('tests/scaleway_provider')
    sls(['package'], { env: {} })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    expect(zipfiles.includes(`package/flask/__init__.py`)).toBeTruthy() // flask is packaged
    expect(zipfiles.includes(`package/boto3/__init__.py`)).toBeTruthy() // boto3 is packaged
  },
  { skip: true }, // sls v4 supports aws provider only
)

test('function-level individually: basic single function', async () => {
  process.chdir('tests/function_level_individually_basic')
  sls(['package'], { env: {} })

  // Verify individual function package exists and contains Python dependencies
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes('handler.py')).toBeTruthy() // handler.py is packaged in individual function

  expect(individualZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in individual function

  expect(individualZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi (requests dependency) is packaged in individual function

  // Verify shared package does NOT exist
  // (when all Python functions are individually packaged, no shared package is created)
  expect(
    pathExistsSync('.serverless/sls-py-func-level-indiv-basic.zip'),
  ).toBeFalsy() // shared package does NOT exist (correct - no shared Python functions)
})

test('function-level individually: mixed packaging (individual + shared)', async () => {
  process.chdir('tests/function_level_individually_mixed_pkg')
  sls(['package'], { env: {} })

  // Verify individual function package contains Python dependencies
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in individual function

  expect(individualZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in individual function

  // Verify shared package exists and contains Python dependencies for shared function
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-mixed-pkg.zip',
  )
  expect(sharedZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in shared package

  expect(sharedZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in shared package
})

test('function-level individually: mixed runtimes (Node provider, Python individual)', async () => {
  process.chdir('tests/function_level_individually_mixed_rt')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify Python function package contains Python dependencies
  const pythonZip = await listZipFiles('.serverless/pythonFunction.zip')
  expect(pythonZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in Python function

  expect(pythonZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in Python function

  // Verify shared package does NOT contain Python dependencies
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-mixed-rt.zip',
  )
  expect(sharedZip.includes(`requests/__init__.py`)).toBeFalsy() // requests is NOT in shared package (no shared Python functions)

  expect(sharedZip.includes(`certifi/__init__.py`)).toBeFalsy() // certifi is NOT in shared package (no shared Python functions)
})

test('function-level individually: zip mode basic', async () => {
  process.chdir('tests/function_level_individually_zip_basic')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package has zip mode artifacts
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes('.requirements.zip')).toBeTruthy() // zipped requirements are packaged in individual function

  expect(individualZip.includes('unzip_requirements.py')).toBeTruthy() // unzip helper is packaged in individual function

  expect(individualZip.includes(`requests/__init__.py`)).toBeFalsy() // requests is NOT packaged directly (it's in .requirements.zip)

  // Verify requests is inside .requirements.zip
  const zippedReqs = await listRequirementsZipFiles(
    '.serverless/individualFunction.zip',
  )
  expect(zippedReqs.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged inside .requirements.zip

  // Verify shared package does NOT exist (no shared Python functions)
  expect(
    pathExistsSync('.serverless/sls-py-func-level-zip-basic.zip'),
  ).toBeFalsy() // shared package does NOT exist (correct - no shared Python functions)
})

test('function-level individually: zip mode mixed (individual + shared)', async () => {
  process.chdir('tests/function_level_individually_zip_mixed')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package has zip mode artifacts
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes('.requirements.zip')).toBeTruthy() // .requirements.zip is in individual function package

  expect(individualZip.includes('unzip_requirements.py')).toBeTruthy() // unzip helper is in individual function package

  const individualReqs = await listRequirementsZipFiles(
    '.serverless/individualFunction.zip',
  )
  expect(individualReqs.includes(`requests/__init__.py`)).toBeTruthy() // requests is inside individual .requirements.zip

  // Verify shared package has zip mode artifacts
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-zip-mixed.zip',
  )
  expect(sharedZip.includes('.requirements.zip')).toBeTruthy() // .requirements.zip is in shared package

  expect(sharedZip.includes('unzip_requirements.py')).toBeTruthy() // unzip helper is in shared package

  const sharedReqs = await listRequirementsZipFiles(
    '.serverless/sls-py-func-level-zip-mixed.zip',
  )
  expect(sharedReqs.includes(`requests/__init__.py`)).toBeTruthy() // requests is inside shared .requirements.zip
})

test('function-level individually: multiple functions', async () => {
  process.chdir('tests/function_level_individually_multiple')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify function1 package contains Python dependencies
  const function1Zip = await listZipFiles('.serverless/function1.zip')
  expect(function1Zip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in function1

  expect(function1Zip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in function1

  // Verify function2 package contains Python dependencies
  const function2Zip = await listZipFiles('.serverless/function2.zip')
  expect(function2Zip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in function2

  expect(function2Zip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in function2

  // Verify shared package does NOT exist (all Python functions are individually packaged)
  expect(
    pathExistsSync('.serverless/sls-py-func-level-indiv-multi.zip'),
  ).toBeFalsy() // shared package does NOT exist (correct - no shared Python functions)
})

test('function-level individually: slim mode', async () => {
  process.chdir('tests/function_level_individually_slim')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package is slimmed
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in individual function

  expect(individualZip.filter((filename) => filename.endsWith('.pyc'))).toEqual(
    [],
  ) // no .pyc files in individual function (slimmed)

  expect(
    individualZip.filter((filename) => filename.endsWith('__main__.py'))
      .length > 0,
  ).toBeTruthy() // __main__.py files are present in individual function

  // Verify shared package is slimmed
  const sharedZip = await listZipFiles('.serverless/sls-py-func-level-slim.zip')
  expect(sharedZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in shared package

  expect(sharedZip.filter((filename) => filename.endsWith('.pyc'))).toEqual([]) // no .pyc files in shared package (slimmed)

  expect(
    sharedZip.filter((filename) => filename.endsWith('__main__.py')).length > 0,
  ).toBeTruthy() // __main__.py files are present in shared package
})

test('function-level individually: subdirectories (module paths)', async () => {
  process.chdir('tests/function_level_individually_subdirs')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify module1 function package
  const module1Zip = await listZipFiles(
    '.serverless/module1-sls-py-func-level-subdirs-dev-function1.zip',
  )
  expect(module1Zip.includes('handler1.py')).toBeTruthy() // handler1.py is packaged at root level in module1 function

  expect(module1Zip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in module1 function

  expect(module1Zip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in module1 function

  // Verify module2 function package
  const module2Zip = await listZipFiles(
    '.serverless/module2-sls-py-func-level-subdirs-dev-function2.zip',
  )
  expect(module2Zip.includes('handler2.py')).toBeTruthy() // handler2.py is packaged at root level in module2 function

  expect(module2Zip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in module2 function

  expect(module2Zip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in module2 function

  // Verify shared package does NOT exist
  expect(
    pathExistsSync('.serverless/sls-py-func-level-subdirs.zip'),
  ).toBeFalsy() // shared package does NOT exist (all functions individually packaged)
})

test('function-level individually: requirements clean', async () => {
  process.chdir('tests/function_level_individually_zip_basic')

  // First, package to create artifacts with zip mode
  sls(['package'], { env: { pythonBin: getPythonBin(3), zip: 'true' } })

  // Verify .requirements artifact exists in service root
  expect(pathExistsSync('.requirements.zip')).toBeTruthy() // .requirements.zip exists in service root after package

  // Run clean command
  sls(['requirements', 'clean'], { env: { pythonBin: getPythonBin(3) } })
  // Verify .requirements artifact is removed
  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // .requirements.zip removed from service root after clean
})

test('function-level individually: all functions individual (no shared)', async () => {
  process.chdir('tests/function_level_individually_all_individual')
  const testDir = process.cwd() // Store absolute path to test directory
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify function1 package contains Python dependencies
  const function1Zip = await listZipFiles(
    join(
      testDir,
      '.serverless/module1-sls-py-func-level-all-indiv-dev-function1.zip',
    ),
  )
  expect(function1Zip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in function1

  expect(function1Zip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in function1

  // Verify function2 package contains Python dependencies
  const function2Zip = await listZipFiles(
    join(
      testDir,
      '.serverless/module2-sls-py-func-level-all-indiv-dev-function2.zip',
    ),
  )
  expect(function2Zip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in function2

  expect(function2Zip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in function2

  // Verify shared package does NOT exist
  expect(
    pathExistsSync(
      join(testDir, '.serverless/sls-py-func-level-all-indiv.zip'),
    ),
  ).toBeFalsy() // shared package does NOT exist (all Python functions individually packaged)

  // Verify no shared .serverless/requirements directory created
  expect(pathExistsSync(join(testDir, '.serverless/requirements'))).toBeFalsy() // shared requirements directory NOT created (no shared Python functions)
})

test('function-level individually: override service-level setting', async () => {
  process.chdir('tests/function_level_individually_override')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package contains Python dependencies
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in individual function

  expect(individualZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in individual function

  // Verify shared package contains Python dependencies for shared function
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-override.zip',
  )
  expect(sharedZip.includes(`requests/__init__.py`)).toBeTruthy() // requests is packaged in shared package

  expect(sharedZip.includes(`certifi/__init__.py`)).toBeTruthy() // certifi is packaged in shared package
})

test('function-level individually: no Python functions (Node.js only)', async () => {
  process.chdir('tests/function_level_individually_no_python')
  sls(['package'], { env: {} })

  // Verify individual function package exists
  expect(pathExistsSync('.serverless/individualFunction.zip')).toBeTruthy() // individual function package created

  // Verify shared package exists
  expect(pathExistsSync('.serverless/sls-no-python-functions.zip')).toBeTruthy() // shared package created

  // Verify NO Python artifacts were created
  expect(pathExistsSync('.serverless/requirements')).toBeFalsy() // no Python requirements directory created

  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // no .requirements.zip created

  // Verify individual package doesn't contain Python artifacts
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  expect(individualZip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in individual package

  expect(individualZip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in individual package

  // Verify shared package doesn't contain Python artifacts
  const sharedZip = await listZipFiles(
    '.serverless/sls-no-python-functions.zip',
  )
  expect(sharedZip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in shared package

  expect(sharedZip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in shared package
})

test('function-level individually: no Python functions - multi individual (Node.js only)', async () => {
  process.chdir('tests/function_level_individually_no_python_multi_individual')
  sls(['package'], { env: {} })

  // Verify both individual function packages exist
  expect(pathExistsSync('.serverless/function1.zip')).toBeTruthy() // function1 package created

  expect(pathExistsSync('.serverless/function2.zip')).toBeTruthy() // function2 package created

  // Verify NO shared package exists (all functions individually packaged)
  expect(
    pathExistsSync('.serverless/sls-no-python-multi-individual.zip'),
  ).toBeFalsy() // no shared package created

  // Verify NO Python artifacts were created
  expect(pathExistsSync('.serverless/requirements')).toBeFalsy() // no Python requirements directory created

  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // no .requirements.zip created

  // Verify individual packages don't contain Python artifacts
  const function1Zip = await listZipFiles('.serverless/function1.zip')
  expect(function1Zip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in function1 package

  expect(function1Zip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in function1 package

  const function2Zip = await listZipFiles('.serverless/function2.zip')
  expect(function2Zip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in function2 package

  expect(function2Zip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in function2 package
})

test('function-level individually: no Python functions - service level (Node.js only)', async () => {
  process.chdir('tests/function_level_individually_no_python_service_level')
  sls(['package'], { env: {} })

  // Verify both individual function packages exist
  expect(pathExistsSync('.serverless/function1.zip')).toBeTruthy() // function1 package created

  expect(pathExistsSync('.serverless/function2.zip')).toBeTruthy() // function2 package created

  // Verify NO shared package exists (service-level individually)
  expect(
    pathExistsSync('.serverless/sls-no-python-service-level.zip'),
  ).toBeFalsy() // no shared package created

  // Verify NO Python artifacts were created
  expect(pathExistsSync('.serverless/requirements')).toBeFalsy() // no Python requirements directory created

  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // no .requirements.zip created

  // Verify individual packages don't contain Python artifacts
  const function1Zip = await listZipFiles('.serverless/function1.zip')
  expect(function1Zip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in function1 package

  expect(function1Zip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in function1 package

  const function2Zip = await listZipFiles('.serverless/function2.zip')
  expect(function2Zip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in function2 package

  expect(function2Zip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in function2 package
})

test('function-level individually: no Python functions - shared packaging (Node.js only)', async () => {
  process.chdir('tests/function_level_individually_no_python_shared')
  sls(['package'], { env: {} })

  // Verify shared package exists (default shared packaging)
  expect(pathExistsSync('.serverless/sls-no-python-shared.zip')).toBeTruthy() // shared package created

  // Verify NO individual packages created
  expect(pathExistsSync('.serverless/function1.zip')).toBeFalsy() // no individual function1 package

  expect(pathExistsSync('.serverless/function2.zip')).toBeFalsy() // no individual function2 package

  // Verify NO Python artifacts were created
  expect(pathExistsSync('.serverless/requirements')).toBeFalsy() // no Python requirements directory created

  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // no .requirements.zip created

  // Verify shared package doesn't contain Python artifacts
  const sharedZip = await listZipFiles('.serverless/sls-no-python-shared.zip')
  expect(sharedZip.includes('unzip_requirements.py')).toBeFalsy() // no unzip_requirements.py in shared package

  expect(sharedZip.includes('.requirements.zip')).toBeFalsy() // no .requirements.zip in shared package
})

test('built-in plugin stays disabled without custom block', async () => {
  process.chdir('tests/missing_custom_block')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // The plugin should not install or package Python requirements
  expect(pathExistsSync('.serverless/requirements')).toBeFalsy() // no Python requirements directory created

  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // no .requirements.zip created

  const sharedZip = await listZipFiles(
    '.serverless/sls-missing-custom-block.zip',
  )
  expect(sharedZip.some((entry) => entry.startsWith('certifi/'))).toBeFalsy() // certifi dependency not bundled

  expect(sharedZip.includes('handler.py')).toBeTruthy() // Python handler still packaged
  expect(sharedZip.includes('index.js')).toBeTruthy() // Node handler still packaged
})

test('built-in plugin disabled via enabled:false', async () => {
  process.chdir('tests/missing_custom_block_disabled')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  expect(pathExistsSync('.serverless/requirements')).toBeFalsy() // no Python requirements directory created

  expect(pathExistsSync('.requirements.zip')).toBeFalsy() // no .requirements.zip created

  const sharedZip = await listZipFiles(
    '.serverless/sls-missing-custom-block-disabled.zip',
  )
  expect(sharedZip.some((entry) => entry.startsWith('certifi/'))).toBeFalsy() // certifi dependency not bundled when disabled

  expect(sharedZip.includes('handler.py')).toBeTruthy() // Python handler still packaged
  expect(sharedZip.includes('index.js')).toBeTruthy() // Node handler still packaged
})
