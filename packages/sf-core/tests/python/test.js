import crossSpawn from 'cross-spawn'
import { globSync } from 'glob'
import JSZip from 'jszip'
import sha256File from 'sha256-file'
import tape from 'tape-promise/tape.js'
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
      console.error(`Error running: ${quote([cmd, ...args])}`) // eslint-disable-line no-console
      throw error
    }
    if (status && !options['noThrow']) {
      console.error('STDOUT: ', stdout.toString()) // eslint-disable-line no-console
      console.error('STDERR: ', stderr.toString()) // eslint-disable-line no-console
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

const testFilter = (() => {
  const elems = process.argv.slice(2) // skip ['node', 'test.js']
  if (elems.length) {
    return (desc) =>
      elems.some((text) => desc.search(text) != -1) ? tape.test : tape.test.skip
  } else {
    return () => tape.test
  }
})()

const test = (desc, func, opts = {}) =>
  testFilter(desc)(desc, opts, async (t) => {
    setup()
    let ended = false
    try {
      await func(t)
      ended = true
    } catch (err) {
      t.fail(err)
    } finally {
      try {
        teardown()
      } catch (err) {
        t.fail(err)
      }
      if (!ended) t.end()
    }
  })

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
  async (t) => {
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
    t.true(
      stderr.includes(
        `-v ${__dirname}${sep}tests${sep}base${sep}custom_ssh:/root/.ssh/custom_ssh:z`,
      ),
      'docker command properly resolved',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('default pythonBin can package flask with default options', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('py3.13 packages have the same hash', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: {} })
  const fileHash = sha256File('.serverless/sls-py-req-test.zip')
  sls(['package'], { env: {} })
  t.equal(
    sha256File('.serverless/sls-py-req-test.zip'),
    fileHash,
    'packages have the same hash',
  )
  t.end()
})

test('mixed runtimes - shared packaging (no individually)', async (t) => {
  process.chdir('tests/mixed_runtime_shared')
  npm(['install'])
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify NO individual function zips created (shared packaging)
  t.false(
    pathExistsSync('.serverless/pythonFunction.zip'),
    'no individual package for pythonFunction',
  )
  t.false(
    pathExistsSync('.serverless/nodeFunction.zip'),
    'no individual package for nodeFunction',
  )

  // Verify shared package exists
  t.true(
    pathExistsSync('.serverless/sls-mixed-rt-shared.zip'),
    'shared service package exists',
  )

  // Verify shared package contains Python dependencies but not Node-only artifacts
  const sharedZip = await listZipFiles('.serverless/sls-mixed-rt-shared.zip')
  t.true(
    sharedZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in shared package',
  )
  t.true(
    sharedZip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in shared package',
  )
  t.true(
    sharedZip.includes('index.js'),
    'Node handler is included in shared package',
  )
  t.true(
    sharedZip.some((p) => p.startsWith('node_modules/lodash/')),
    'Lodash dependency is included in shared package',
  )

  t.end()
})

test('py3.13 can package flask with default options', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test(
  'py3.13 can package flask with hashes',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], {
      env: {
        fileName: 'requirements-w-hashes.txt',
        pythonBin: getPythonBin(3),
      },
    })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.end()
  },
  { skip: brokenOn('win32') },
)

test('py3.13 can package flask with nested', async (t) => {
  process.chdir('tests/base')
  sls(['package'], {
    env: {
      fileName: 'requirements-w-nested.txt',
      pythonBin: getPythonBin(3),
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('py3.13 can package flask with zip option', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged',
  )
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own",
  )
  t.end()
})

test('py3.13 can package flask with slim option', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { slim: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.true(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
    '__main__.py files are packaged',
  )
  t.end()
})

test('py3.13 can package flask with slim & slimPatterns options', async (t) => {
  process.chdir('tests/base')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test("py3.13 doesn't package bottle with noDeploy option", async (t) => {
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
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.false(zipfiles.includes(`bottle.py`), 'bottle is NOT packaged')
  t.end()
})

test('py3.13 can package boto3 with editable', async (t) => {
  process.chdir('tests/base')
  sls(['package'], {
    env: {
      fileName: 'requirements-w-editable.txt',
      pythonBin: getPythonBin(3),
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.true(zipfiles.includes(`botocore${sep}__init__.py`), 'botocore is packaged')
  t.end()
})

test(
  'py3.13 can package flask with dockerizePip option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with slim & dockerizePip option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.deepEqual(
      zipfiles.filter((filename) => filename.endsWith('.pyc')),
      [],
      '*.pyc files are NOT packaged',
    )
    t.true(
      zipfiles.filter((filename) => filename.endsWith('__main__.py')).length >
        0,
      '__main__.py files are packaged',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with slim & dockerizePip & slimPatterns options',
  async (t) => {
    process.chdir('tests/base')
    copySync('_slimPatterns.yml', 'slimPatterns.yml')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.deepEqual(
      zipfiles.filter((filename) => filename.endsWith('.pyc')),
      [],
      '*.pyc files are packaged',
    )
    t.deepEqual(
      zipfiles.filter((filename) => filename.endsWith('__main__.py')),
      [],
      '__main__.py files are NOT packaged',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with zip & dockerizePip option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', zip: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    const zippedReqs = await listRequirementsZipFiles(
      '.serverless/sls-py-req-test.zip',
    )
    t.true(
      zipfiles.includes('.requirements.zip'),
      'zipped requirements are packaged',
    )
    t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
    t.false(
      zipfiles.includes(`flask${sep}__init__.py`),
      "flask isn't packaged on its own",
    )
    t.true(
      zippedReqs.includes(`flask/__init__.py`),
      'flask is packaged in the .requirements.zip file',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 can package flask with zip & slim & dockerizePip option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], {
      env: { dockerizePip: 'true', zip: 'true', slim: 'true' },
    })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    const zippedReqs = await listRequirementsZipFiles(
      '.serverless/sls-py-req-test.zip',
    )
    t.true(
      zipfiles.includes('.requirements.zip'),
      'zipped requirements are packaged',
    )
    t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
    t.false(
      zipfiles.includes(`flask${sep}__init__.py`),
      "flask isn't packaged on its own",
    )
    t.true(
      zippedReqs.includes(`flask/__init__.py`),
      'flask is packaged in the .requirements.zip file',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('pipenv py3.13 can package flask with default options', async (t) => {
  process.chdir('tests/pipenv')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.false(
    zipfiles.includes(`pytest${sep}__init__.py`),
    'dev-package pytest is NOT packaged',
  )
  t.end()
})

test('uv py3.13 can package flask with default options', async (t) => {
  process.chdir('tests/uv')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  t.true(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
    'uv export used',
  )
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('uv installer is used when installer=uv', async (t) => {
  process.chdir('tests/uv_installer')
  const { stderr } = sls(['package'], {
    env: { SLS_DEBUG: '*' },
    noThrow: true,
  })
  // In debug mode we expect to see uv pip invocation in logs, or an explicit uv-not-found error
  t.true(
    stderr && stderr.includes('uv pip install'),
    'uv installer used (debug shows uv pip)',
  )
  t.end()
})

test('uv py3.13 can package flask with slim option', async (t) => {
  process.chdir('tests/uv')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*', slim: 'true' } })
  t.true(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
    'uv export used',
  )
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.true(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
    '__main__.py files are packaged',
  )
  t.end()
})

test('uv py3.13 can package flask with slim & slimPatterns options', async (t) => {
  process.chdir('tests/uv')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*', slim: 'true' } })
  t.true(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
    'uv export used',
  )
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test('uv py3.13 can package flask with zip option', async (t) => {
  process.chdir('tests/uv')
  const { stderr } = sls(['package'], {
    env: { SLS_DEBUG: '*', zip: 'true', pythonBin: getPythonBin(3) },
  })
  t.true(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
    'uv export used',
  )
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged',
  )
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own",
  )
  t.end()
})

test('uv py3.13 doesnt package bottle with noDeploy option', async (t) => {
  process.chdir('tests/uv')
  perl([
    '-p',
    '-i.bak',
    '-e',
    's/(pythonRequirements:$)/\\1\\n    noDeploy: [bottle]/',
    'serverless.yml',
  ])
  const { stderr } = sls(['package'], { env: { SLS_DEBUG: '*' } })
  t.true(
    stderr && stderr.includes('Generating requirements.txt from uv.lock'),
    'uv export used',
  )
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.false(zipfiles.includes(`bottle.py`), 'bottle is NOT packaged')
  t.end()
})

test('pipenv py3.13 can package flask with slim option', async (t) => {
  process.chdir('tests/pipenv')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.true(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
    '__main__.py files are packaged',
  )
  t.end()
})

test('pipenv py3.13 can package flask with slim & slimPatterns options', async (t) => {
  process.chdir('tests/pipenv')

  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test('pipenv py3.13 can package flask with zip option', async (t) => {
  process.chdir('tests/pipenv')
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged',
  )
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own",
  )
  t.end()
})

test("pipenv py3.13 doesn't package bottle with noDeploy option", async (t) => {
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
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.false(zipfiles.includes(`bottle.py`), 'bottle is NOT packaged')
  t.end()
})

test('non build pyproject.toml uses requirements.txt', async (t) => {
  process.chdir('tests/non_build_pyproject')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('non build uv project uses requirements.txt when useUv=false', async (t) => {
  process.chdir('tests/non_build_uv')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('non poetry pyproject.toml without requirements.txt packages handler only', async (t) => {
  process.chdir('tests/non_poetry_pyproject')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`handler.py`), 'handler is packaged')
  t.end()
})

test('poetry py3.13 can package flask with default options', async (t) => {
  process.chdir('tests/poetry')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`bottle.py`), 'bottle is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('poetry py3.13 can package flask with slim option', async (t) => {
  process.chdir('tests/poetry')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.true(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')).length > 0,
    '__main__.py files are packaged',
  )
  t.end()
})

test('poetry py3.13 can package flask with slim & slimPatterns options', async (t) => {
  process.chdir('tests/poetry')

  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], { env: { slim: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test('poetry py3.13 can package flask with zip option', async (t) => {
  process.chdir('tests/poetry')
  sls(['package'], { env: { zip: 'true', pythonBin: getPythonBin(3) } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged',
  )
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own",
  )
  t.end()
})

test("poetry py3.13 doesn't package bottle with noDeploy option", async (t) => {
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
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.false(zipfiles.includes(`bottle.py`), 'bottle is NOT packaged')
  t.end()
})

test('py3.13 can package flask with zip option and no explicit include', async (t) => {
  process.chdir('tests/base')
  perl(['-p', '-i.bak', '-e', 's/include://', 'serverless.yml'])
  perl(['-p', '-i.bak', '-e', 's/^.*handler.py.*$//', 'serverless.yml'])
  sls(['package'], { env: { zip: 'true' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged',
  )
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own",
  )
  t.end()
})

test('py3.13 can package lambda-decorators using vendor option', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { vendor: './vendor' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.true(
    zipfiles.includes(`lambda_decorators.py`),
    'lambda_decorators.py is packaged',
  )
  t.end()
})

test(
  "Don't nuke execute perms",
  async (t) => {
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
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
    t.true(
      zipfiles.includes(`lambda_decorators.py`),
      'lambda_decorators.py is packaged',
    )
    t.true(zipfiles.includes(`foobar`), 'foobar is packaged')

    const zipfiles_with_metadata = await listZipFilesWithMetaData(
      '.serverless/sls-py-req-test.zip',
    )
    t.true(
      zipfiles_with_metadata['foobar'].unixPermissions
        .toString(8)
        .slice(3, 6) === perm,
      'foobar has retained its executable file permissions',
    )

    const flaskPerm = statSync('.serverless/requirements/bin/flask').mode
    t.true(
      zipfiles_with_metadata['bin/flask'].unixPermissions === flaskPerm,
      'bin/flask has retained its executable file permissions',
    )

    t.end()
  },
  { skip: process.platform === 'win32' },
)

test('py3.13 can package flask in a project with a space in it', async (t) => {
  copySync('tests/base', 'tests/base with a space')
  process.chdir('tests/base with a space')
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test(
  'py3.13 can package flask in a project with a space in it with docker',
  async (t) => {
    copySync('tests/base', 'tests/base with a space')
    process.chdir('tests/base with a space')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('py3.13 supports custom file name with fileName option', async (t) => {
  process.chdir('tests/base')
  writeFileSync('puck', 'requests')
  sls(['package'], { env: { fileName: 'puck' } })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`requests${sep}__init__.py`), 'requests is packaged')
  t.false(zipfiles.includes(`flask${sep}__init__.py`), 'flask is NOT packaged')
  t.false(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is NOT packaged')
  t.end()
})

test("py3.13 doesn't package bottle with zip option", async (t) => {
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
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged',
  )
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged')
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own",
  )
  t.true(
    zippedReqs.includes(`flask/__init__.py`),
    'flask is packaged in the .requirements.zip file',
  )
  t.false(
    zippedReqs.includes(`bottle.py`),
    'bottle is NOT packaged in the .requirements.zip file',
  )
  t.end()
})

test('py3.13 can package flask with slim, slimPatterns & slimPatternsAppendDefaults=false options', async (t) => {
  process.chdir('tests/base')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')
  sls(['package'], {
    env: { slim: 'true', slimPatternsAppendDefaults: 'false' },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(
    zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
    'pyc files are packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test(
  'py3.13 can package flask with slim & dockerizePip & slimPatterns & slimPatternsAppendDefaults=false options',
  async (t) => {
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
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.true(
      zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
      'pyc files are packaged',
    )
    t.deepEqual(
      zipfiles.filter((filename) => filename.endsWith('__main__.py')),
      [],
      '__main__.py files are NOT packaged',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('pipenv py3.13 can package flask with slim & slimPatterns & slimPatternsAppendDefaults=false  option', async (t) => {
  process.chdir('tests/pipenv')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')

  sls(['package'], {
    env: { slim: 'true', slimPatternsAppendDefaults: 'false' },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(
    zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
    'pyc files are packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test('poetry py3.13 can package flask with slim & slimPatterns & slimPatternsAppendDefaults=false  option', async (t) => {
  process.chdir('tests/poetry')
  copySync('_slimPatterns.yml', 'slimPatterns.yml')

  sls(['package'], {
    env: { slim: 'true', slimPatternsAppendDefaults: 'false' },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(
    zipfiles.filter((filename) => filename.endsWith('.pyc')).length >= 1,
    'pyc files are packaged',
  )
  t.deepEqual(
    zipfiles.filter((filename) => filename.endsWith('__main__.py')),
    [],
    '__main__.py files are NOT packaged',
  )
  t.end()
})

test('poetry py3.13 can package flask with package individually option', async (t) => {
  process.chdir('tests/poetry_individually')

  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles(
    '.serverless/module1-sls-py-req-test-dev-hello.zip',
  )
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`bottle.py`), 'bottle is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('py3.13 can package flask with package individually option', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true' } })
  const zipfiles_hello = await listZipFiles('.serverless/hello.zip')
  t.false(
    zipfiles_hello.includes(`fn2${sep}__init__.py`),
    'fn2 is NOT packaged in function hello',
  )
  t.true(
    zipfiles_hello.includes('handler.py'),
    'handler.py is packaged in function hello',
  )
  t.false(
    zipfiles_hello.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello',
  )
  t.true(
    zipfiles_hello.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello',
  )

  const zipfiles_hello2 = await listZipFiles('.serverless/hello2.zip')
  t.false(
    zipfiles_hello2.includes(`fn2${sep}__init__.py`),
    'fn2 is NOT packaged in function hello2',
  )
  t.true(
    zipfiles_hello2.includes('handler.py'),
    'handler.py is packaged in function hello2',
  )
  t.false(
    zipfiles_hello2.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello2',
  )
  t.true(
    zipfiles_hello2.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello2',
  )

  const zipfiles_hello3 = await listZipFiles('.serverless/hello3.zip')
  t.false(
    zipfiles_hello3.includes(`fn2${sep}__init__.py`),
    'fn2 is NOT packaged in function hello3',
  )
  t.true(
    zipfiles_hello3.includes('handler.py'),
    'handler.py is packaged in function hello3',
  )
  t.false(
    zipfiles_hello3.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello3',
  )
  t.false(
    zipfiles_hello3.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello3',
  )

  const zipfiles_hello4 = await listZipFiles(
    '.serverless/fn2-sls-py-req-test-dev-hello4.zip',
  )
  t.false(
    zipfiles_hello4.includes(`fn2${sep}__init__.py`),
    'fn2 is NOT packaged in function hello4',
  )
  t.true(
    zipfiles_hello4.includes('fn2_handler.py'),
    'fn2_handler is packaged in the zip-root in function hello4',
  )
  t.true(
    zipfiles_hello4.includes(`dataclasses.py`),
    'dataclasses is packaged in function hello4',
  )
  t.false(
    zipfiles_hello4.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello4',
  )

  t.end()
})

test('py3.13 can package flask with package individually & slim option', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true', slim: 'true' } })
  const zipfiles_hello = await listZipFiles('.serverless/hello.zip')
  t.true(
    zipfiles_hello.includes('handler.py'),
    'handler.py is packaged in function hello',
  )
  t.deepEqual(
    zipfiles_hello.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged in function hello',
  )
  t.true(
    zipfiles_hello.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello',
  )
  t.false(
    zipfiles_hello.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello',
  )

  const zipfiles_hello2 = await listZipFiles('.serverless/hello2.zip')
  t.true(
    zipfiles_hello2.includes('handler.py'),
    'handler.py is packaged in function hello2',
  )
  t.deepEqual(
    zipfiles_hello2.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged in function hello2',
  )
  t.true(
    zipfiles_hello2.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello2',
  )
  t.false(
    zipfiles_hello2.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello2',
  )

  const zipfiles_hello3 = await listZipFiles('.serverless/hello3.zip')
  t.true(
    zipfiles_hello3.includes('handler.py'),
    'handler.py is packaged in function hello3',
  )
  t.deepEqual(
    zipfiles_hello3.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged in function hello3',
  )
  t.false(
    zipfiles_hello3.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello3',
  )

  const zipfiles_hello4 = await listZipFiles(
    '.serverless/fn2-sls-py-req-test-dev-hello4.zip',
  )
  t.true(
    zipfiles_hello4.includes('fn2_handler.py'),
    'fn2_handler is packaged in the zip-root in function hello4',
  )
  t.true(
    zipfiles_hello4.includes(`dataclasses.py`),
    'dataclasses is packaged in function hello4',
  )
  t.false(
    zipfiles_hello4.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello4',
  )
  t.deepEqual(
    zipfiles_hello4.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged in function hello4',
  )

  t.end()
})

test('py3.13 can package only requirements of module', async (t) => {
  process.chdir('tests/individually')
  sls(['package'], { env: {} })
  const zipfiles_hello = await listZipFiles(
    '.serverless/module1-sls-py-req-test-indiv-dev-hello1.zip',
  )
  t.true(
    zipfiles_hello.includes('handler1.py'),
    'handler1.py is packaged at root level in function hello1',
  )
  t.false(
    zipfiles_hello.includes('handler2.py'),
    'handler2.py is NOT packaged at root level in function hello1',
  )
  t.true(
    zipfiles_hello.includes(`pyaml${sep}__init__.py`),
    'pyaml is packaged in function hello1',
  )
  t.true(
    zipfiles_hello.includes(`boto3${sep}__init__.py`),
    'boto3 is packaged in function hello1',
  )
  t.false(
    zipfiles_hello.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello1',
  )

  const zipfiles_hello2 = await listZipFiles(
    '.serverless/module2-sls-py-req-test-indiv-dev-hello2.zip',
  )
  t.true(
    zipfiles_hello2.includes('handler2.py'),
    'handler2.py is packaged at root level in function hello2',
  )
  t.false(
    zipfiles_hello2.includes('handler1.py'),
    'handler1.py is NOT packaged at root level in function hello2',
  )
  t.false(
    zipfiles_hello2.includes(`pyaml${sep}__init__.py`),
    'pyaml is NOT packaged in function hello2',
  )
  t.false(
    zipfiles_hello2.includes(`boto3${sep}__init__.py`),
    'boto3 is NOT packaged in function hello2',
  )
  t.true(
    zipfiles_hello2.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello2',
  )

  t.end()
})

test('py3.13 can package lambda-decorators using vendor and invidiually option', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true', vendor: './vendor' } })
  const zipfiles_hello = await listZipFiles('.serverless/hello.zip')
  t.true(
    zipfiles_hello.includes('handler.py'),
    'handler.py is packaged at root level in function hello',
  )
  t.true(
    zipfiles_hello.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello',
  )
  t.true(
    zipfiles_hello.includes(`lambda_decorators.py`),
    'lambda_decorators.py is packaged in function hello',
  )
  t.false(
    zipfiles_hello.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello',
  )

  const zipfiles_hello2 = await listZipFiles('.serverless/hello2.zip')
  t.true(
    zipfiles_hello2.includes('handler.py'),
    'handler.py is packaged at root level in function hello2',
  )
  t.true(
    zipfiles_hello2.includes(`flask${sep}__init__.py`),
    'flask is packaged in function hello2',
  )
  t.true(
    zipfiles_hello2.includes(`lambda_decorators.py`),
    'lambda_decorators.py is packaged in function hello2',
  )
  t.false(
    zipfiles_hello2.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello2',
  )

  const zipfiles_hello3 = await listZipFiles('.serverless/hello3.zip')
  t.true(
    zipfiles_hello3.includes('handler.py'),
    'handler.py is packaged at root level in function hello3',
  )
  t.false(
    zipfiles_hello3.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello3',
  )
  t.false(
    zipfiles_hello3.includes(`lambda_decorators.py`),
    'lambda_decorators.py is NOT packaged in function hello3',
  )
  t.false(
    zipfiles_hello3.includes(`dataclasses.py`),
    'dataclasses is NOT packaged in function hello3',
  )

  const zipfiles_hello4 = await listZipFiles(
    '.serverless/fn2-sls-py-req-test-dev-hello4.zip',
  )
  t.true(
    zipfiles_hello4.includes('fn2_handler.py'),
    'fn2_handler is packaged in the zip-root in function hello4',
  )
  t.true(
    zipfiles_hello4.includes(`dataclasses.py`),
    'dataclasses is packaged in function hello4',
  )
  t.false(
    zipfiles_hello4.includes(`flask${sep}__init__.py`),
    'flask is NOT packaged in function hello4',
  )
  t.end()
})

test(
  "Don't nuke execute perms when using individually",
  async (t) => {
    process.chdir('tests/individually')
    const perm = '755'
    writeFileSync(`module1${sep}foobar`, '')
    chmodSync(`module1${sep}foobar`, perm)

    sls(['package'], { env: {} })
    const zipfiles_hello1 = await listZipFilesWithMetaData(
      '.serverless/hello1.zip',
    )

    t.true(
      zipfiles_hello1['module1/foobar'].unixPermissions
        .toString(8)
        .slice(3, 6) === perm,
      'foobar has retained its executable file permissions',
    )

    const zipfiles_hello2 = await listZipFilesWithMetaData(
      '.serverless/module2-sls-py-req-test-indiv-dev-hello2.zip',
    )
    const flaskPerm = statSync(
      '.serverless/module2/requirements/bin/flask',
    ).mode

    t.true(
      zipfiles_hello2['bin/flask'].unixPermissions === flaskPerm,
      'bin/flask has retained its executable file permissions',
    )

    t.end()
  },
  { skip: process.platform === 'win32' },
)

test(
  "Don't nuke execute perms when using individually w/docker",
  async (t) => {
    process.chdir('tests/individually')
    const perm = '755'
    writeFileSync(`module1${sep}foobar`, '', { mode: perm })
    chmodSync(`module1${sep}foobar`, perm)

    sls(['package'], { env: { dockerizePip: 'true' } })
    const zipfiles_hello = await listZipFilesWithMetaData(
      '.serverless/hello1.zip',
    )

    t.true(
      zipfiles_hello['module1/foobar'].unixPermissions
        .toString(8)
        .slice(3, 6) === perm,
      'foobar has retained its executable file permissions',
    )

    const zipfiles_hello2 = await listZipFilesWithMetaData(
      '.serverless/module2-sls-py-req-test-indiv-dev-hello2.zip',
    )
    const flaskPerm = statSync(
      '.serverless/module2/requirements/bin/flask',
    ).mode

    t.true(
      zipfiles_hello2['bin/flask'].unixPermissions === flaskPerm,
      'bin/flask has retained its executable file permissions',
    )

    t.end()
  },
  { skip: !canUseDocker() || process.platform === 'win32' },
)

test(
  'py3.13 can package flask running in docker with module runtime & architecture of function',
  async (t) => {
    process.chdir('tests/individually_mixed_runtime')

    sls(['package'], {
      env: { dockerizePip: 'true' },
    })

    const zipfiles_hello2 = await listZipFiles(
      '.serverless/module2-sls-py-req-test-indiv-mixed-runtime-dev-hello2.zip',
    )
    t.true(
      zipfiles_hello2.includes('handler2.py'),
      'handler2.py is packaged at root level in function hello2',
    )
    t.true(
      zipfiles_hello2.includes(`flask${sep}__init__.py`),
      'flask is packaged in function hello2',
    )
  },
  {
    skip: !canUseDocker() || process.platform === 'win32',
  },
)

test(
  'py3.13 can package flask succesfully when using mixed architecture, docker and zipping',
  async (t) => {
    process.chdir('tests/individually_mixed_runtime')
    sls(['package'], { env: { dockerizePip: 'true', zip: 'true' } })

    const zipfiles_hello = await listZipFiles('.serverless/hello1.zip')
    t.true(
      zipfiles_hello.includes(`module1${sep}handler1.ts`),
      'handler1.ts is packaged in module dir for hello1',
    )
    t.false(
      zipfiles_hello.includes('handler2.py'),
      'handler2.py is NOT packaged at root level in function hello1',
    )
    t.false(
      zipfiles_hello.includes(`flask${sep}__init__.py`),
      'flask is NOT packaged in function hello1',
    )

    const zipfiles_hello2 = await listZipFiles(
      '.serverless/module2-sls-py-req-test-indiv-mixed-runtime-dev-hello2.zip',
    )
    const zippedReqs = await listRequirementsZipFiles(
      '.serverless/module2-sls-py-req-test-indiv-mixed-runtime-dev-hello2.zip',
    )
    t.true(
      zipfiles_hello2.includes('handler2.py'),
      'handler2.py is packaged at root level in function hello2',
    )
    t.false(
      zipfiles_hello2.includes(`module1${sep}handler1.ts`),
      'handler1.ts is NOT included at module1 level in hello2',
    )
    t.false(
      zipfiles_hello2.includes(`pyaml${sep}__init__.py`),
      'pyaml is NOT packaged in function hello2',
    )
    t.false(
      zipfiles_hello2.includes(`boto3${sep}__init__.py`),
      'boto3 is NOT included in zipfile',
    )
    t.true(
      zippedReqs.includes(`flask${sep}__init__.py`),
      'flask is packaged in function hello2 in requirements.zip',
    )

    t.end()
  },
  { skip: !canUseDocker() || process.platform === 'win32' },
)

test(
  'py3.13 uses download cache by default option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: {} })
    const cachepath = getUserCachePath()
    t.true(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
      'cache directory exists',
    )
    t.end()
  },
  { skip: true },
)

test(
  'py3.13 uses download cache by default',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { cacheLocation: '.requirements-cache' } })
    t.true(
      pathExistsSync(
        `.requirements-cache${sep}downloadCacheslspyc${sep}http-v2`,
      ),
      'cache directory exists',
    )
    t.end()
  },
  { skip: true },
)

test(
  'py3.13 uses download cache with dockerizePip option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const cachepath = getUserCachePath()
    t.true(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
      'cache directory exists',
    )
    t.end()
  },
  // { skip: !canUseDocker() || brokenOn('win32') }
  { skip: true },
)

test(
  'py3.13 uses download cache with dockerizePip by default option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], {
      env: { dockerizePip: 'true', cacheLocation: '.requirements-cache' },
    })
    t.true(
      pathExistsSync(
        `.requirements-cache${sep}downloadCacheslspyc${sep}http-v2`,
      ),
      'cache directory exists',
    )
    t.end()
  },
  // { skip: !canUseDocker() || brokenOn('win32') }
  { skip: true },
)

test(
  'py3.13 uses static and download cache',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: {} })
    const cachepath = getUserCachePath()
    const cacheFolderHash = sha256Path('.serverless/requirements.txt')
    const arch = 'x86_64'
    t.true(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
      'http exists in download-cache',
    )
    t.true(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
      ),
      'flask exists in static-cache',
    )
    t.end()
  },
  { skip: true },
)

test(
  'py3.13 uses static and download cache with dockerizePip option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true' } })
    const cachepath = getUserCachePath()
    const cacheFolderHash = sha256Path('.serverless/requirements.txt')
    const arch = 'x86_64'
    t.true(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
      'http-v2 exists in download-cache',
    )
    t.true(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
      ),
      'flask exists in static-cache',
    )
    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('py3.13 uses static cache', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: {} })
  const cachepath = getUserCachePath()
  const cacheFolderHash = sha256Path('.serverless/requirements.txt')
  const arch = 'x86_64'
  t.true(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
    ),
    'flask exists in static-cache',
  )
  t.true(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}.completed_requirements`,
    ),
    '.completed_requirements exists in static-cache',
  )

  // py3.13 checking that static cache actually pulls from cache (by poisoning it)
  writeFileSync(
    `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}injected_file_is_bad_form`,
    'injected new file into static cache folder',
  )
  sls(['package'], { env: {} })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(
    zipfiles.includes('injected_file_is_bad_form'),
    "static cache is really used when running 'sls package' again",
  )

  t.end()
})

test('py3.13 uses static cache with cacheLocation option', async (t) => {
  process.chdir('tests/base')
  const cachepath = '.requirements-cache'
  sls(['package'], { env: { cacheLocation: cachepath } })
  const cacheFolderHash = sha256Path('.serverless/requirements.txt')
  const arch = 'x86_64'
  t.true(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
    ),
    'flask exists in static-cache',
  )
  t.true(
    pathExistsSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}.completed_requirements`,
    ),
    '.completed_requirements exists in static-cache',
  )
  t.end()
})

test(
  'py3.13 uses static cache with dockerizePip & slim option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const cachepath = getUserCachePath()
    const cacheFolderHash = sha256Path('.serverless/requirements.txt')
    const arch = 'x86_64'
    t.true(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}flask`,
      ),
      'flask exists in static-cache',
    )
    t.true(
      pathExistsSync(
        `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}.completed_requirements`,
      ),
      '.completed_requirements exists in static-cache',
    )

    // py3.13 checking that static cache actually pulls from cache (by poisoning it)
    writeFileSync(
      `${cachepath}${sep}${cacheFolderHash}_${arch}_slspyc${sep}injected_file_is_bad_form`,
      'injected new file into static cache folder',
    )
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(
      zipfiles.includes('injected_file_is_bad_form'),
      "static cache is really used when running 'sls package' again",
    )
    t.deepEqual(
      zipfiles.filter((filename) => filename.endsWith('.pyc')),
      [],
      'no pyc files are packaged',
    )

    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test(
  'py3.13 uses download cache with dockerizePip & slim option',
  async (t) => {
    process.chdir('tests/base')
    sls(['package'], { env: { dockerizePip: 'true', slim: 'true' } })
    const cachepath = getUserCachePath()
    t.true(
      pathExistsSync(`${cachepath}${sep}downloadCacheslspyc${sep}http-v2`),
      'http-v2 exists in download-cache',
    )

    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
    t.deepEqual(
      zipfiles.filter((filename) => filename.endsWith('.pyc')),
      [],
      'no pyc files are packaged',
    )

    t.end()
  },
  { skip: !canUseDocker() || brokenOn('win32') },
)

test('py3.13 can ignore functions defined with `image`', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { individually: 'true' } })
  t.true(pathExistsSync('.serverless/hello.zip'), 'function hello is packaged')
  t.true(
    pathExistsSync('.serverless/hello2.zip'),
    'function hello2 is packaged',
  )
  t.true(
    pathExistsSync('.serverless/hello3.zip'),
    'function hello3 is packaged',
  )
  t.true(
    pathExistsSync('.serverless/hello4.zip'),
    'function hello4 is packaged',
  )
  t.false(
    pathExistsSync('.serverless/hello5.zip'),
    'function hello5 is not packaged',
  )

  t.end()
})

test('poetry py3.13 fails packaging if poetry.lock is missing and flag requirePoetryLockFile is set to true', async (t) => {
  copySync('tests/poetry', 'tests/base with a space')
  process.chdir('tests/base with a space')
  removeSync('poetry.lock')

  const { stderr } = sls(['package'], {
    env: { requirePoetryLockFile: 'true', slim: 'true' },
    noThrow: true,
  })
  t.true(
    stderr.includes(
      'poetry.lock file not found - set requirePoetryLockFile to false to disable this error',
    ),
    'flag works and error is properly reported',
  )
  t.end()
})

test('works with provider.runtime not being python', async (t) => {
  process.chdir('tests/base')
  sls(['package'], { env: { runtime: 'nodejs20.x' } })
  t.true(
    pathExistsSync('.serverless/sls-py-req-test.zip'),
    'sls-py-req-test is packaged',
  )
  t.end()
})

test('poetry py3.13 packages additional optional packages', async (t) => {
  process.chdir('tests/poetry_packages')
  sls(['package'], {
    env: {
      poetryWithGroups: 'poetryWithGroups',
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.true(zipfiles.includes(`bottle.py`), 'bottle is packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('poetry py3.13 skips additional optional packages specified in withoutGroups', async (t) => {
  process.chdir('tests/poetry_packages')
  sls(['package'], {
    env: {
      poetryWithGroups: 'poetryWithGroups',
      poetryWithoutGroups: 'poetryWithoutGroups',
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged')
  t.false(zipfiles.includes(`bottle.py`), 'bottle is NOT packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test('poetry py3.13 only installs optional packages specified in onlyGroups', async (t) => {
  process.chdir('tests/poetry_packages')
  sls(['package'], {
    env: {
      poetryOnlyGroups: 'poetryOnlyGroups',
    },
  })
  const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
  t.false(zipfiles.includes(`flask${sep}__init__.py`), 'flask is NOT packaged')
  t.false(zipfiles.includes(`bottle.py`), 'bottle is NOT packaged')
  t.true(zipfiles.includes(`boto3${sep}__init__.py`), 'boto3 is packaged')
  t.end()
})

test(
  'py3.7 injects dependencies into `package` folder when using scaleway provider',
  async (t) => {
    process.chdir('tests/scaleway_provider')
    sls(['package'], { env: {} })
    const zipfiles = await listZipFiles('.serverless/sls-py-req-test.zip')
    t.true(
      zipfiles.includes(`package${sep}flask${sep}__init__.py`),
      'flask is packaged',
    )
    t.true(
      zipfiles.includes(`package${sep}boto3${sep}__init__.py`),
      'boto3 is packaged',
    )
    t.end()
  },
  { skip: true }, // sls v4 supports aws provider only
)

test('function-level individually: basic single function', async (t) => {
  process.chdir('tests/function_level_individually_basic')
  sls(['package'], { env: {} })

  // Verify individual function package exists and contains Python dependencies
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.true(
    individualZip.includes('handler.py'),
    'handler.py is packaged in individual function',
  )
  t.true(
    individualZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in individual function',
  )
  t.true(
    individualZip.includes(`certifi${sep}__init__.py`),
    'certifi (requests dependency) is packaged in individual function',
  )

  // Verify shared package does NOT exist
  // (when all Python functions are individually packaged, no shared package is created)
  t.false(
    pathExistsSync('.serverless/sls-py-func-level-indiv-basic.zip'),
    'shared package does NOT exist (correct - no shared Python functions)',
  )

  t.end()
})

test('function-level individually: mixed packaging (individual + shared)', async (t) => {
  process.chdir('tests/function_level_individually_mixed_pkg')
  sls(['package'], { env: {} })

  // Verify individual function package contains Python dependencies
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.true(
    individualZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in individual function',
  )
  t.true(
    individualZip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in individual function',
  )

  // Verify shared package exists and contains Python dependencies for shared function
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-mixed-pkg.zip',
  )
  t.true(
    sharedZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in shared package',
  )
  t.true(
    sharedZip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in shared package',
  )

  t.end()
})

test('function-level individually: mixed runtimes (Node provider, Python individual)', async (t) => {
  process.chdir('tests/function_level_individually_mixed_rt')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify Python function package contains Python dependencies
  const pythonZip = await listZipFiles('.serverless/pythonFunction.zip')
  t.true(
    pythonZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in Python function',
  )
  t.true(
    pythonZip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in Python function',
  )

  // Verify shared package does NOT contain Python dependencies
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-mixed-rt.zip',
  )
  t.false(
    sharedZip.includes(`requests${sep}__init__.py`),
    'requests is NOT in shared package (no shared Python functions)',
  )
  t.false(
    sharedZip.includes(`certifi${sep}__init__.py`),
    'certifi is NOT in shared package (no shared Python functions)',
  )

  t.end()
})

test('function-level individually: zip mode basic', async (t) => {
  process.chdir('tests/function_level_individually_zip_basic')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package has zip mode artifacts
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.true(
    individualZip.includes('.requirements.zip'),
    'zipped requirements are packaged in individual function',
  )
  t.true(
    individualZip.includes('unzip_requirements.py'),
    'unzip helper is packaged in individual function',
  )
  t.false(
    individualZip.includes(`requests${sep}__init__.py`),
    "requests is NOT packaged directly (it's in .requirements.zip)",
  )

  // Verify requests is inside .requirements.zip
  const zippedReqs = await listRequirementsZipFiles(
    '.serverless/individualFunction.zip',
  )
  t.true(
    zippedReqs.includes(`requests/__init__.py`),
    'requests is packaged inside .requirements.zip',
  )

  // Verify shared package does NOT exist (no shared Python functions)
  t.false(
    pathExistsSync('.serverless/sls-py-func-level-zip-basic.zip'),
    'shared package does NOT exist (correct - no shared Python functions)',
  )

  t.end()
})

test('function-level individually: zip mode mixed (individual + shared)', async (t) => {
  process.chdir('tests/function_level_individually_zip_mixed')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package has zip mode artifacts
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.true(
    individualZip.includes('.requirements.zip'),
    '.requirements.zip is in individual function package',
  )
  t.true(
    individualZip.includes('unzip_requirements.py'),
    'unzip helper is in individual function package',
  )

  const individualReqs = await listRequirementsZipFiles(
    '.serverless/individualFunction.zip',
  )
  t.true(
    individualReqs.includes(`requests/__init__.py`),
    'requests is inside individual .requirements.zip',
  )

  // Verify shared package has zip mode artifacts
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-zip-mixed.zip',
  )
  t.true(
    sharedZip.includes('.requirements.zip'),
    '.requirements.zip is in shared package',
  )
  t.true(
    sharedZip.includes('unzip_requirements.py'),
    'unzip helper is in shared package',
  )

  const sharedReqs = await listRequirementsZipFiles(
    '.serverless/sls-py-func-level-zip-mixed.zip',
  )
  t.true(
    sharedReqs.includes(`requests/__init__.py`),
    'requests is inside shared .requirements.zip',
  )

  t.end()
})

test('function-level individually: multiple functions', async (t) => {
  process.chdir('tests/function_level_individually_multiple')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify function1 package contains Python dependencies
  const function1Zip = await listZipFiles('.serverless/function1.zip')
  t.true(
    function1Zip.includes(`requests${sep}__init__.py`),
    'requests is packaged in function1',
  )
  t.true(
    function1Zip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in function1',
  )

  // Verify function2 package contains Python dependencies
  const function2Zip = await listZipFiles('.serverless/function2.zip')
  t.true(
    function2Zip.includes(`requests${sep}__init__.py`),
    'requests is packaged in function2',
  )
  t.true(
    function2Zip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in function2',
  )

  // Verify shared package does NOT exist (all Python functions are individually packaged)
  t.false(
    pathExistsSync('.serverless/sls-py-func-level-indiv-multi.zip'),
    'shared package does NOT exist (correct - no shared Python functions)',
  )

  t.end()
})

test('function-level individually: slim mode', async (t) => {
  process.chdir('tests/function_level_individually_slim')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package is slimmed
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.true(
    individualZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in individual function',
  )
  t.deepEqual(
    individualZip.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no .pyc files in individual function (slimmed)',
  )
  t.true(
    individualZip.filter((filename) => filename.endsWith('__main__.py'))
      .length > 0,
    '__main__.py files are present in individual function',
  )

  // Verify shared package is slimmed
  const sharedZip = await listZipFiles('.serverless/sls-py-func-level-slim.zip')
  t.true(
    sharedZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in shared package',
  )
  t.deepEqual(
    sharedZip.filter((filename) => filename.endsWith('.pyc')),
    [],
    'no .pyc files in shared package (slimmed)',
  )
  t.true(
    sharedZip.filter((filename) => filename.endsWith('__main__.py')).length > 0,
    '__main__.py files are present in shared package',
  )

  t.end()
})

test('function-level individually: subdirectories (module paths)', async (t) => {
  process.chdir('tests/function_level_individually_subdirs')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify module1 function package
  const module1Zip = await listZipFiles(
    '.serverless/module1-sls-py-func-level-subdirs-dev-function1.zip',
  )
  t.true(
    module1Zip.includes('handler1.py'),
    'handler1.py is packaged at root level in module1 function',
  )
  t.true(
    module1Zip.includes(`requests${sep}__init__.py`),
    'requests is packaged in module1 function',
  )
  t.true(
    module1Zip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in module1 function',
  )

  // Verify module2 function package
  const module2Zip = await listZipFiles(
    '.serverless/module2-sls-py-func-level-subdirs-dev-function2.zip',
  )
  t.true(
    module2Zip.includes('handler2.py'),
    'handler2.py is packaged at root level in module2 function',
  )
  t.true(
    module2Zip.includes(`requests${sep}__init__.py`),
    'requests is packaged in module2 function',
  )
  t.true(
    module2Zip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in module2 function',
  )

  // Verify shared package does NOT exist
  t.false(
    pathExistsSync('.serverless/sls-py-func-level-subdirs.zip'),
    'shared package does NOT exist (all functions individually packaged)',
  )

  t.end()
})

test('function-level individually: requirements clean', async (t) => {
  process.chdir('tests/function_level_individually_zip_basic')

  // First, package to create artifacts with zip mode
  sls(['package'], { env: { pythonBin: getPythonBin(3), zip: 'true' } })

  // Verify .requirements artifact exists in service root
  t.true(
    pathExistsSync('.requirements.zip'),
    '.requirements.zip exists in service root after package',
  )

  // Run clean command
  sls(['requirements', 'clean'], { env: { pythonBin: getPythonBin(3) } })

  // Verify .requirements artifact is removed
  t.false(
    pathExistsSync('.requirements.zip'),
    '.requirements.zip removed from service root after clean',
  )
})

test('function-level individually: all functions individual (no shared)', async (t) => {
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
  t.true(
    function1Zip.includes(`requests${sep}__init__.py`),
    'requests is packaged in function1',
  )
  t.true(
    function1Zip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in function1',
  )

  // Verify function2 package contains Python dependencies
  const function2Zip = await listZipFiles(
    join(
      testDir,
      '.serverless/module2-sls-py-func-level-all-indiv-dev-function2.zip',
    ),
  )
  t.true(
    function2Zip.includes(`requests${sep}__init__.py`),
    'requests is packaged in function2',
  )
  t.true(
    function2Zip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in function2',
  )

  // Verify shared package does NOT exist
  t.false(
    pathExistsSync(
      join(testDir, '.serverless/sls-py-func-level-all-indiv.zip'),
    ),
    'shared package does NOT exist (all Python functions individually packaged)',
  )

  // Verify no shared .serverless/requirements directory created
  t.false(
    pathExistsSync(join(testDir, '.serverless/requirements')),
    'shared requirements directory NOT created (no shared Python functions)',
  )

  t.end()
})

test('function-level individually: override service-level setting', async (t) => {
  process.chdir('tests/function_level_individually_override')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // Verify individual function package contains Python dependencies
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.true(
    individualZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in individual function',
  )
  t.true(
    individualZip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in individual function',
  )

  // Verify shared package contains Python dependencies for shared function
  const sharedZip = await listZipFiles(
    '.serverless/sls-py-func-level-override.zip',
  )
  t.true(
    sharedZip.includes(`requests${sep}__init__.py`),
    'requests is packaged in shared package',
  )
  t.true(
    sharedZip.includes(`certifi${sep}__init__.py`),
    'certifi is packaged in shared package',
  )

  t.end()
})

test('function-level individually: no Python functions (Node.js only)', async (t) => {
  process.chdir('tests/function_level_individually_no_python')
  sls(['package'], { env: {} })

  // Verify individual function package exists
  t.true(
    pathExistsSync('.serverless/individualFunction.zip'),
    'individual function package created',
  )

  // Verify shared package exists
  t.true(
    pathExistsSync('.serverless/sls-no-python-functions.zip'),
    'shared package created',
  )

  // Verify NO Python artifacts were created
  t.false(
    pathExistsSync('.serverless/requirements'),
    'no Python requirements directory created',
  )
  t.false(pathExistsSync('.requirements.zip'), 'no .requirements.zip created')

  // Verify individual package doesn't contain Python artifacts
  const individualZip = await listZipFiles('.serverless/individualFunction.zip')
  t.false(
    individualZip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in individual package',
  )
  t.false(
    individualZip.includes('.requirements.zip'),
    'no .requirements.zip in individual package',
  )

  // Verify shared package doesn't contain Python artifacts
  const sharedZip = await listZipFiles(
    '.serverless/sls-no-python-functions.zip',
  )
  t.false(
    sharedZip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in shared package',
  )
  t.false(
    sharedZip.includes('.requirements.zip'),
    'no .requirements.zip in shared package',
  )

  t.end()
})

test('function-level individually: no Python functions - multi individual (Node.js only)', async (t) => {
  process.chdir('tests/function_level_individually_no_python_multi_individual')
  sls(['package'], { env: {} })

  // Verify both individual function packages exist
  t.true(
    pathExistsSync('.serverless/function1.zip'),
    'function1 package created',
  )
  t.true(
    pathExistsSync('.serverless/function2.zip'),
    'function2 package created',
  )

  // Verify NO shared package exists (all functions individually packaged)
  t.false(
    pathExistsSync('.serverless/sls-no-python-multi-individual.zip'),
    'no shared package created',
  )

  // Verify NO Python artifacts were created
  t.false(
    pathExistsSync('.serverless/requirements'),
    'no Python requirements directory created',
  )
  t.false(pathExistsSync('.requirements.zip'), 'no .requirements.zip created')

  // Verify individual packages don't contain Python artifacts
  const function1Zip = await listZipFiles('.serverless/function1.zip')
  t.false(
    function1Zip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in function1 package',
  )
  t.false(
    function1Zip.includes('.requirements.zip'),
    'no .requirements.zip in function1 package',
  )

  const function2Zip = await listZipFiles('.serverless/function2.zip')
  t.false(
    function2Zip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in function2 package',
  )
  t.false(
    function2Zip.includes('.requirements.zip'),
    'no .requirements.zip in function2 package',
  )

  t.end()
})

test('function-level individually: no Python functions - service level (Node.js only)', async (t) => {
  process.chdir('tests/function_level_individually_no_python_service_level')
  sls(['package'], { env: {} })

  // Verify both individual function packages exist
  t.true(
    pathExistsSync('.serverless/function1.zip'),
    'function1 package created',
  )
  t.true(
    pathExistsSync('.serverless/function2.zip'),
    'function2 package created',
  )

  // Verify NO shared package exists (service-level individually)
  t.false(
    pathExistsSync('.serverless/sls-no-python-service-level.zip'),
    'no shared package created',
  )

  // Verify NO Python artifacts were created
  t.false(
    pathExistsSync('.serverless/requirements'),
    'no Python requirements directory created',
  )
  t.false(pathExistsSync('.requirements.zip'), 'no .requirements.zip created')

  // Verify individual packages don't contain Python artifacts
  const function1Zip = await listZipFiles('.serverless/function1.zip')
  t.false(
    function1Zip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in function1 package',
  )
  t.false(
    function1Zip.includes('.requirements.zip'),
    'no .requirements.zip in function1 package',
  )

  const function2Zip = await listZipFiles('.serverless/function2.zip')
  t.false(
    function2Zip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in function2 package',
  )
  t.false(
    function2Zip.includes('.requirements.zip'),
    'no .requirements.zip in function2 package',
  )

  t.end()
})

test('function-level individually: no Python functions - shared packaging (Node.js only)', async (t) => {
  process.chdir('tests/function_level_individually_no_python_shared')
  sls(['package'], { env: {} })

  // Verify shared package exists (default shared packaging)
  t.true(
    pathExistsSync('.serverless/sls-no-python-shared.zip'),
    'shared package created',
  )

  // Verify NO individual packages created
  t.false(
    pathExistsSync('.serverless/function1.zip'),
    'no individual function1 package',
  )
  t.false(
    pathExistsSync('.serverless/function2.zip'),
    'no individual function2 package',
  )

  // Verify NO Python artifacts were created
  t.false(
    pathExistsSync('.serverless/requirements'),
    'no Python requirements directory created',
  )
  t.false(pathExistsSync('.requirements.zip'), 'no .requirements.zip created')

  // Verify shared package doesn't contain Python artifacts
  const sharedZip = await listZipFiles('.serverless/sls-no-python-shared.zip')
  t.false(
    sharedZip.includes('unzip_requirements.py'),
    'no unzip_requirements.py in shared package',
  )
  t.false(
    sharedZip.includes('.requirements.zip'),
    'no .requirements.zip in shared package',
  )

  t.end()
})

test('built-in plugin stays disabled without custom block', async (t) => {
  process.chdir('tests/missing_custom_block')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  // The plugin should not install or package Python requirements
  t.false(
    pathExistsSync('.serverless/requirements'),
    'no Python requirements directory created',
  )
  t.false(pathExistsSync('.requirements.zip'), 'no .requirements.zip created')

  const sharedZip = await listZipFiles(
    '.serverless/sls-missing-custom-block.zip',
  )
  t.false(
    sharedZip.some((entry) => entry.startsWith('certifi/')),
    'certifi dependency not bundled',
  )
  t.true(sharedZip.includes('handler.py'), 'Python handler still packaged')
  t.true(sharedZip.includes('index.js'), 'Node handler still packaged')

  t.end()
})

test('built-in plugin disabled via enabled:false', async (t) => {
  process.chdir('tests/missing_custom_block_disabled')
  sls(['package'], { env: { pythonBin: getPythonBin(3) } })

  t.false(
    pathExistsSync('.serverless/requirements'),
    'no Python requirements directory created',
  )
  t.false(pathExistsSync('.requirements.zip'), 'no .requirements.zip created')

  const sharedZip = await listZipFiles(
    '.serverless/sls-missing-custom-block-disabled.zip',
  )
  t.false(
    sharedZip.some((entry) => entry.startsWith('certifi/')),
    'certifi dependency not bundled when disabled',
  )
  t.true(sharedZip.includes('handler.py'), 'Python handler still packaged')
  t.true(sharedZip.includes('index.js'), 'Node handler still packaged')

  t.end()
})
