/**
 * Python functions on this machine run on the developer's own interpreter, never in a container:
 * the active virtualenv, the service's .venv, or the first Python 3 on PATH; on Windows then the
 * interpreter pyenv-win selects and the one the py launcher picks.
 */
import fs from 'fs'
import path from 'path'
import { execFile as nodeExecFile, spawn as nodeSpawn } from 'child_process'
import { CLIENT_FILES, clientPath } from '../paths.js'
import { workerSpawnOptions } from './spawn-options.js'

// Names the version and the interpreter's own path, so what runs afterwards is that interpreter,
// not a version manager's shim or the py launcher that found it.
const INTERPRETER_SCRIPT =
  'import sys; print("%d.%d.%d" % sys.version_info[:3]); print(sys.executable)'
const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}
// The oldest Python the runtime client runs on.
const MINIMUM_MINOR = 9

/** Where a function's code runs from: its `module` directory (the requirements plugin's), else the service directory. */
const codeRootOf = ({ functionConfig = {}, serviceDir }) =>
  functionConfig.module
    ? path.join(serviceDir, functionConfig.module)
    : serviceDir

const deployedVersion = (runtime) =>
  /^python(\d+\.\d+)/.exec(String(runtime ?? ''))?.[1] ?? null

const venvPython = (dir, platform) =>
  platform === 'win32'
    ? path.join(dir, 'Scripts', 'python.exe')
    : path.join(dir, 'bin', 'python')

const python3Minor = (version) => {
  const match = /^3\.(\d+)\.\d+$/.exec(String(version ?? ''))
  return match ? Number(match[1]) : null
}

/** Version names from a pyenv version file or PYENV_VERSION; a `#` comments out the rest of a line. */
const versionNames = (text) =>
  String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, ''))
    .join(' ')
    .split(/[\s:]+/)
    .filter(Boolean)

/**
 * The interpreters pyenv-win would run here, read from its own files: its shims are .bat files
 * that only a shell can start, and Dev Mode never spawns through a shell. The selection is
 * PYENV_VERSION, else the nearest .python-version from the service directory up, else the global
 * version file; versions that are not installed are skipped.
 */
const pyenvWinPythons = ({ serviceDir, env, exists, readFile }) => {
  const variable = (name) =>
    Object.entries(env).find(([key]) => key.toUpperCase() === name)?.[1]
  const root = ['PYENV_ROOT', 'PYENV', 'PYENV_HOME'].map(variable).find(Boolean)
  if (!root) return []
  const local = () => {
    for (let dir = path.resolve(serviceDir); ; dir = path.dirname(dir)) {
      const names = versionNames(readFile(path.join(dir, '.python-version')))
      if (names.length) return names
      if (path.dirname(dir) === dir) return []
    }
  }
  const selected = [
    () => versionNames(variable('PYENV_VERSION')),
    local,
    () => versionNames(readFile(path.join(root, 'version'))),
  ]
    .map((names) => names())
    .find((names) => names.length)
  return (selected ?? [])
    .map((name) => path.join(root, 'versions', name, 'python.exe'))
    .filter((file) => exists(file))
}

/**
 * The interpreters to try, in order: the active virtualenv, the service's .venv, then PATH, and
 * on Windows the ones pyenv-win selects. The py launcher comes last (see `detectLocal`).
 */
export const pythonCandidates = ({
  serviceDir,
  env = process.env,
  platform = process.platform,
  exists = fs.existsSync,
  readFile = readText,
}) => {
  const venvs = [env.VIRTUAL_ENV, path.join(serviceDir, '.venv')]
    .filter(Boolean)
    .map((dir) => venvPython(dir, platform))
    .filter((file) => exists(file))
  const onPath =
    platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
  const pyenv =
    platform === 'win32'
      ? pyenvWinPythons({ serviceDir, env, exists, readFile })
      : []
  return [...new Set([...venvs, ...onPath, ...pyenv])]
}

/**
 * What `command args…` prints, or null when it fails: a missing interpreter fails in the
 * callback, but spawning also throws synchronously for some failures (a file Windows cannot
 * execute), and either way detection moves on to the next candidate. Python writes the pipe in
 * UTF-8, which is how it is read: on Windows it would otherwise use the ANSI code page, and a
 * path with a non-ASCII user name would be garbled or fail to encode.
 */
const outputOf = (command, args, { execFile, env }) =>
  new Promise((resolve) => {
    try {
      execFile(
        command,
        args,
        {
          timeout: 5000,
          windowsHide: true,
          env: { ...env, PYTHONIOENCODING: 'utf-8' },
        },
        (error, stdout) => resolve(error ? null : String(stdout)),
      )
    } catch {
      resolve(null)
    }
  })

/**
 * The version of the Python a command starts and that interpreter's own path, from one run. A
 * path that does not exist (whatever the reason) is not one.
 */
const interpreterOf = async (command, args, runner, exists) => {
  const output = await outputOf(
    command,
    [...args, '-c', INTERPRETER_SCRIPT],
    runner,
  )
  const [version, executable] = String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
  return {
    version: version || null,
    executable: executable && exists(executable) ? executable : null,
  }
}

export const pythonAdapter = Object.freeze({
  name: 'python',
  label: 'Python',
  matches: (runtime) => String(runtime ?? '').startsWith('python'),
  deployedVersion,
  localVersionKey: (version) =>
    String(version ?? '')
      .split('.')
      .slice(0, 2)
      .join('.'),
  missingWhy: (runtime, local) =>
    local?.version
      ? `Python ${local.version} on this machine (Dev Mode needs Python 3.${MINIMUM_MINOR} or later)`
      : `Python not found on this machine (install Python ${deployedVersion(runtime) ?? '3'}, or create .venv in the service directory)`,
  async detectLocal({
    serviceDir,
    env = process.env,
    platform = process.platform,
    exists = fs.existsSync,
    readFile = readText,
    execFile = nodeExecFile,
  } = {}) {
    let tooOld = null
    const runner = { execFile, env }
    for (const command of pythonCandidates({
      serviceDir,
      env,
      platform,
      exists,
      readFile,
    })) {
      const { version, executable } = await interpreterOf(
        command,
        [],
        runner,
        exists,
      )
      const minor = python3Minor(version)
      if (minor === null) continue
      if (minor >= MINIMUM_MINOR) {
        // The interpreter itself, so a version manager's shim is not in between.
        return { available: true, command: executable ?? command, version }
      }
      // A Python 3 too old for the client: kept so the reason can name it.
      tooOld ??= version
    }
    if (platform === 'win32') {
      // The Python 3 the py launcher picks (python.org installs do not put `python` on PATH by
      // default); only its interpreter's own path runs, never the launcher.
      const { version, executable } = await interpreterOf(
        'py',
        ['-3'],
        runner,
        exists,
      )
      const minor = python3Minor(version)
      if (minor !== null && executable) {
        if (minor >= MINIMUM_MINOR) {
          return { available: true, command: executable, version }
        }
        tooOld ??= version
      }
    }
    return { available: false, command: null, version: tooOld }
  },
  /**
   * Whether the handler's module is in the service directory, where the client imports it from
   * (`PYTHONPATH` is the code root): `<module>.py`, a compiled `<module>.pyc`, or a package's
   * `__init__.py`. For a function deployed from `package.artifact`.
   */
  hasHandler: ({ functionConfig = {}, serviceDir, exists = fs.existsSync }) => {
    const moduleName = String(functionConfig.handler ?? '').split(
      /\.(?=[^.]*$)/,
    )[0]
    if (!moduleName) return false
    // The client imports `src/app` and `src.app` alike.
    const modulePath = path.join(
      codeRootOf({ functionConfig, serviceDir }),
      ...moduleName.split(/[./]/),
    )
    return [
      `${modulePath}.py`,
      `${modulePath}.pyc`,
      path.join(modulePath, '__init__.py'),
    ].some((file) => exists(file))
  },
  async prepare({ functionConfig = {}, serviceDir, exists = fs.existsSync }) {
    const moduleDir = functionConfig.module
    const codeRoot = codeRootOf({ functionConfig, serviceDir })
    // Where the python requirements plugin installs a function's requirements.
    const requirements = path.join(
      serviceDir,
      '.serverless',
      ...(moduleDir ? [moduleDir] : []),
      'requirements',
    )
    return {
      codeRoot,
      handler: String(functionConfig.handler ?? ''),
      loader: null,
      env: {
        PYTHONPATH: codeRoot,
        PYTHONUNBUFFERED: '1',
      },
      // Built for Lambda (possibly for another platform): the client puts it on sys.path after an
      // active virtual environment's own packages (and ahead of any other installed ones).
      fallbackPaths: exists(requirements) ? [requirements] : [],
      nodeOptionsAppend: [],
      warnings: [],
    }
  },
  /**
   * Returns the child process: whoever starts it stops it (on Windows nothing else will). On POSIX
   * it leads its own process group (see `workerSpawnOptions`).
   */
  start({
    local,
    prepared,
    env,
    serviceDir,
    deployedRuntime,
    spawn = nodeSpawn,
    platform = process.platform,
  }) {
    return spawn(
      local.command,
      [
        '-u',
        clientPath(CLIENT_FILES.python),
        JSON.stringify({
          handler: prepared.handler,
          taskRoot: prepared.codeRoot,
          serviceDir,
          ...(prepared.fallbackPaths?.length && {
            fallbackPaths: prepared.fallbackPaths,
          }),
          // Results are serialised the way this runtime's deployed client does.
          deployedRuntime,
          // The client exits once this process, the one that spawns it, is gone.
          parentPid: process.pid,
          // It leads its own process group (see `workerSpawnOptions`), which it takes with it then.
          ownGroup: platform !== 'win32',
        }),
      ],
      workerSpawnOptions({ cwd: prepared.codeRoot, env, platform }),
    )
  },
})
