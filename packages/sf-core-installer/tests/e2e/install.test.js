const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// End-to-end install tests: pack this package, publish it to a local
// registry, then install it by name with real package managers and run
// `serverless --version`, directly and through a proxy. The launcher binary
// comes from install.serverless.com, so these tests need internet access
// (directly, or through the proxy in the proxy-only network run).
//
// Environment:
//   E2E_PACKAGE_MANAGERS  comma-separated specs (default: "npm", the one
//                         bundled with Node.js): npm, npm@<v>, pnpm@<v>,
//                         yarn@<v>, yarn@<v>:pnp, bun
//   E2E_REGISTRY, E2E_PROXY, E2E_AUTH_PROXY, E2E_PROXY_LOG,
//   E2E_AUTH_PROXY_LOG    use externally started servers instead of local
//                         ones, with the log files they write (the
//                         proxy-only network run)
//   E2E_NO_PROXY          hosts that bypass the proxy (default: the registry)
//   E2E_DIRECT            "false" when there is no direct internet access
//
// Not part of `npm test`: run with `npm run test:e2e`.

const packageDir = path.join(__dirname, '..', '..')
const isWindows = process.platform === 'win32'
const binaryName = `serverless-${{ darwin: 'darwin', linux: 'linux' }[process.platform] || 'windows'}-${os.arch() === 'x64' ? 'amd64' : os.arch()}-0.0.2`
const TIMEOUT = 240000
const directInternet = process.env.E2E_DIRECT !== 'false'
const specs = (process.env.E2E_PACKAGE_MANAGERS || 'npm')
  .split(',')
  .map((spec) => spec.trim())
  .filter(Boolean)

// Package managers: how to install, run and opt in to install scripts.
// `scriptsRun` is whether its default policy runs a dependency's install
// script; when it doesn't, the launcher binary is downloaded on first run.
const packageManager = (spec) => {
  const [base, layout] = spec.split(':')
  const [name, version] = base.split('@')
  const major = Number((version || '').split('.')[0]) || undefined
  const via = version ? `corepack ${name}@${version}` : name
  switch (name) {
    case 'npm': {
      const npm = version ? `npx -y npm@${version}` : 'npm'
      const npmMajor =
        major || Number(run('npm --version').stdout.split('.')[0])
      return {
        spec,
        readsNpmrc: true,
        scriptsRun: npmMajor < 12,
        install: `${npm} install --no-audit --no-fund serverless`,
        run: 'serverless --version',
        runInProject: true,
        global: `${npm} install -g --no-audit --no-fund serverless`,
        exec: version
          ? `${npm} exec -y -- serverless --version`
          : 'npx -y serverless --version',
        // npm 12 blocks dependency install scripts unless allowed
        allowScripts: (dir) =>
          editPackageJson(dir, (pkg) => {
            pkg.allowScripts = { serverless: true }
          }),
      }
    }
    case 'pnpm':
      return {
        spec,
        readsNpmrc: true,
        scriptsRun: major < 10,
        // pnpm 11 exits non-zero when it ignores a dependency's build script
        installFailsWhenScriptsBlocked: major >= 11,
        install: `${via} add serverless`,
        run: `${via} exec serverless --version`,
        ignoredBuilds: major >= 10 ? `${via} ignored-builds` : undefined,
        global: `${via} add -g serverless`,
        exec: `${via} dlx serverless --version`,
        allowScripts: (dir) =>
          major >= 11
            ? fs.writeFileSync(
                path.join(dir, 'pnpm-workspace.yaml'),
                'allowBuilds:\n  serverless: true\n',
              )
            : editPackageJson(dir, (pkg) => {
                pkg.pnpm = { onlyBuiltDependencies: ['serverless'] }
              }),
      }
    case 'yarn':
      if (major === 1) {
        return {
          spec,
          readsNpmrc: true,
          scriptsRun: true,
          install: `${via} add serverless`,
          run: `${via} serverless --version`,
          global: `${via} global add serverless`,
        }
      }
      return {
        spec,
        layout: layout || 'node-modules',
        readsNpmrc: false,
        scriptsRun: false,
        install: `${via} add serverless`,
        run: `${via} serverless --version`,
        exec: `${via} dlx serverless --version`,
        allowScripts: (dir) =>
          fs.appendFileSync(
            path.join(dir, '.yarnrc.yml'),
            'enableScripts: true\n',
          ),
      }
    case 'bun':
      return {
        spec,
        readsNpmrc: false,
        scriptsRun: false,
        install: 'bun add serverless',
        run: 'serverless --version',
        runInProject: true,
        global: 'bun add -g serverless',
        exec: 'bunx serverless --version',
        allowScripts: (dir) =>
          editPackageJson(dir, (pkg) => {
            pkg.trustedDependencies = ['serverless']
          }),
      }
    default:
      throw new Error(`unknown package manager spec: ${spec}`)
  }
}

const editPackageJson = (dir, edit) => {
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  edit(pkg)
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2))
}

// Proxy settings, plus the npm_* variables `npm run test:e2e` exports
// (cache, user agent, lifecycle, this package's .npmrc settings): each case
// sets what it needs, as a user's shell would
const INHERITED_KEYS =
  /^(https?_proxy|no_proxy|yarn_https?_proxy|npm_(config|package|lifecycle)_.*)$/i

// Runs a shell command; package managers are .cmd shims on Windows
const run = (command, { cwd, env } = {}) => {
  const clean = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!INHERITED_KEYS.test(key)) clean[key] = value
  }
  const result = spawnSync(command, {
    cwd,
    env: { ...clean, ...env },
    shell: true,
    encoding: 'utf8',
    timeout: TIMEOUT,
  })
  const failure = result.error
    ? `\n${result.error.message}`
    : result.signal
      ? `\nkilled by ${result.signal}`
      : ''
  return { ...result, output: `${result.stdout}\n${result.stderr}${failure}` }
}

const startServer = (script, args, pattern) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, script),
      ...args,
    ])
    let out = ''
    const onData = (chunk) => {
      out += chunk
      const match = out.match(pattern)
      if (match) resolve({ child, url: match[1] })
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (chunk) => (out += chunk))
    child.on('exit', (code) =>
      reject(new Error(`${script} exited ${code}: ${out}`)),
    )
  })

// Where the installer package ended up and what its .bin holds, for failure
// messages
const describeInstall = (dir) => {
  const found = []
  const stack = [path.join(dir, 'node_modules'), path.join(dir, '.yarn')]
  while (stack.length && found.length < 5) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(current, entry.name)
      if (
        entry.name === 'serverless' &&
        fs.existsSync(path.join(full, 'postInstall.js'))
      ) {
        let bin = []
        try {
          bin = fs.readdirSync(path.join(full, 'node_modules', '.bin'))
        } catch {}
        found.push(
          `${path.relative(dir, full)} (.bin: ${bin.join(', ') || 'none'})`,
        )
      } else {
        stack.push(full)
      }
    }
  }
  return found.join('\n') || 'installer package not found'
}

const findBinary = (dir) => {
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.name.startsWith(binaryName)) return full
      if (entry.isDirectory()) stack.push(full)
    }
  }
  return undefined
}

let work
let tarball
const servers = []
let registry
let proxy
let authProxy
let proxyLogFile
let authProxyLogFile
const proxyLog = () => fs.readFileSync(proxyLogFile, 'utf8')
const authProxyLog = () => fs.readFileSync(authProxyLogFile, 'utf8')
// Only a successful tunnel counts, not a DENIED line from the auth proxy
const reachedThroughProxy = (log) =>
  /^CONNECT install\.serverless\.com:443$/m.test(log)

const registryHost = () => new URL(registry).hostname
const noProxy = () => process.env.E2E_NO_PROXY || `${registryHost()},localhost`

// A fresh project configured to install from the local registry
const createProject = (pm, name) => {
  const dir = fs.mkdtempSync(path.join(work, `${name}-`))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'e2e-project', private: true }),
  )
  fs.writeFileSync(path.join(dir, '.npmrc'), `registry=${registry}/\n`)
  fs.writeFileSync(path.join(dir, '.yarnrc'), `registry "${registry}/"\n`)
  fs.writeFileSync(
    path.join(dir, 'bunfig.toml'),
    `[install]\nregistry = "${registry}/"\n`,
  )
  if (pm.layout) {
    fs.writeFileSync(
      path.join(dir, '.yarnrc.yml'),
      `nodeLinker: ${pm.layout}\nnpmRegistryServer: "${registry}"\n` +
        `unsafeHttpWhitelist:\n  - "${registryHost()}"\nenableTelemetry: false\n`,
    )
  }
  return dir
}

// Environment for one case: an isolated npm user config and global prefix,
// the local registry, and the proxy (if any) the way users configure it
const caseEnv = (dir, proxyUrl) => {
  const globalDir = path.join(dir, '.global')
  // npm 10 fails on a configured prefix whose bin/ and lib/ do not exist yet
  for (const sub of ['bin', 'lib']) {
    fs.mkdirSync(path.join(globalDir, sub), { recursive: true })
  }
  const env = {
    npm_config_userconfig: path.join(dir, '.npmrc-user'),
    npm_config_registry: `${registry}/`,
    npm_config_prefix: globalDir,
    npm_config_update_notifier: 'false',
    PNPM_HOME: globalDir,
    BUN_INSTALL: globalDir,
    BUN_CONFIG_REGISTRY: `${registry}/`,
    YARN_NPM_REGISTRY_SERVER: registry,
    YARN_UNSAFE_HTTP_WHITELIST: registryHost(),
    YARN_ENABLE_TELEMETRY: '0',
    YARN_GLOBAL_FOLDER: path.join(globalDir, 'yarn'),
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    COREPACK_ENABLE_STRICT: '0',
    PATH: [
      path.join(globalDir, 'bin'),
      globalDir,
      path.join(dir, 'node_modules', '.bin'),
      // Version-manager shims (mise, asdf) would answer for `serverless`
      // before the package manager's own lookup
      ...(process.env.PATH || '')
        .split(path.delimiter)
        .filter((entry) => !/[\\/](mise|asdf)[\\/]shims$/.test(entry)),
    ].join(path.delimiter),
  }
  if (proxyUrl) {
    env.HTTPS_PROXY = proxyUrl
    env.HTTP_PROXY = proxyUrl
    env.NO_PROXY = noProxy()
  }
  return env
}

// A fresh install for every one-off run: npx and bunx keep the package they
// ran (npm's cache, the temp directory) and reuse it, and that copy would
// already hold the binary from an earlier run, so the download the test
// asserts would not happen. pnpm dlx keeps its default cache location, whose
// paths are already close to the Windows path length limit, and re-installs
// with dlx-cache-max-age 0. Corepack's own cache stays shared: the proxy-only
// network cannot download pnpm or Yarn again.
const freshCaches = (dir) => {
  const tmp = path.join(dir, '.tmp')
  fs.mkdirSync(tmp, { recursive: true })
  return {
    npm_config_cache: path.join(dir, '.npm-cache'),
    npm_config_dlx_cache_max_age: '0',
    pnpm_config_dlx_cache_max_age: '0',
    TMPDIR: tmp,
    TEMP: tmp,
    TMP: tmp,
  }
}

const assertRan = (result, label) => {
  assert.equal(result.status, 0, `${label} failed:\n${result.output}`)
  assert.match(
    result.output,
    /Framework \d+\.\d+\.\d+/,
    `${label}:\n${result.output}`,
  )
}

// Defined after the helpers it uses: a top-level hook starts running as
// soon as it is registered, while the module is still loading
before(async () => {
  // The resolved temp path: Windows runners report it in 8.3 short form
  // (C:\Users\RUNNER~1\...) and macOS behind the /var -> /private/var
  // symlink, and package managers such as pnpm 11 resolve those
  // inconsistently
  work = fs.mkdtempSync(
    path.join(fs.realpathSync.native(os.tmpdir()), 'sf-installer-e2e-'),
  )
  const packed = run(`npm pack --pack-destination "${work}"`, {
    cwd: packageDir,
  })
  assert.equal(packed.status, 0, packed.output)
  tarball = path.join(
    work,
    fs.readdirSync(work).find((f) => f.endsWith('.tgz')),
  )
  proxyLogFile = process.env.E2E_PROXY_LOG || path.join(work, 'proxy.log')
  authProxyLogFile =
    process.env.E2E_AUTH_PROXY_LOG || path.join(work, 'auth-proxy.log')
  if (!process.env.E2E_PROXY_LOG) fs.writeFileSync(proxyLogFile, '')
  if (!process.env.E2E_AUTH_PROXY_LOG) fs.writeFileSync(authProxyLogFile, '')

  if (process.env.E2E_REGISTRY) {
    registry = process.env.E2E_REGISTRY
  } else {
    const server = await startServer(
      'registry.js',
      [tarball],
      /registry listening on (\S+)/,
    )
    servers.push(server.child)
    registry = server.url
  }
  if (process.env.E2E_PROXY) {
    proxy = process.env.E2E_PROXY
    authProxy = process.env.E2E_AUTH_PROXY
  } else {
    const plain = await startServer(
      'proxy.js',
      [proxyLogFile],
      /proxy listening on (\S+)/,
    )
    const auth = await startServer(
      'proxy.js',
      [authProxyLogFile, '0', 'e2e user:p@ss'],
      /proxy listening on (\S+)/,
    )
    servers.push(plain.child, auth.child)
    proxy = plain.url
    authProxy = auth.url.replace('http://', 'http://e2e%20user:p%40ss@')
  }

  // Warm the launcher's own cache in ~/.serverless (the version index, kept
  // for 24 hours, and the framework release). The launcher downloads from the
  // same host as the installer, and a proxy sees only the host of a tunnel,
  // so without this a first run's launcher traffic could satisfy a test that
  // asserts the installer's download went through the proxy.
  const warmUp = createProject({}, 'warm-up')
  const warmEnv = caseEnv(warmUp, directInternet ? undefined : proxy)
  const installed = run('npm install --no-audit --no-fund serverless', {
    cwd: warmUp,
    env: warmEnv,
  })
  assert.equal(
    installed.status,
    0,
    `warm-up install failed:\n${installed.output}`,
  )
  assertRan(
    run('serverless --version', { cwd: warmUp, env: warmEnv }),
    'warm-up',
  )
  const before = proxyLog().length
  assertRan(
    run('serverless --version', { cwd: warmUp, env: caseEnv(warmUp, proxy) }),
    'warm-up check',
  )
  assert.ok(
    !reachedThroughProxy(proxyLog().slice(before)),
    'the launcher still contacts install.serverless.com with a warm cache, ' +
      'so the proxy assertions below could not tell its traffic from the ' +
      "installer's download",
  )
})

after(() => {
  for (const child of servers) child.kill()
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 })
})

for (const spec of specs) {
  describe(`${spec}`, () => {
    const pm = packageManager(spec)

    const assertInstalled = (result, label) => {
      if (pm.installFailsWhenScriptsBlocked && result.status !== 0) {
        // pnpm 11 reports the ignored build script as an error, after the
        // package was installed; the binary then comes on first run
        assert.match(result.output, /ERR_PNPM_IGNORED_BUILDS/, result.output)
        return result
      }
      assert.equal(result.status, 0, `${label} failed:\n${result.output}`)
      return result
    }

    const install = (dir, env) =>
      assertInstalled(run(pm.install, { cwd: dir, env }), 'install')

    const runInProject = (dir, env) => run(pm.run, { cwd: dir, env })

    test(
      'installs and runs through a proxy set in HTTPS_PROXY',
      { timeout: TIMEOUT * 2 },
      (t) => {
        if (pm.layout === 'pnp') {
          // Under Plug'n'Play the package stays inside Yarn's zip archive, so
          // there is no directory to put the downloaded binary in unless Yarn
          // unpacks it, which it does for packages allowed to run their build
          // script. Users on Plug'n'Play set `enableScripts: true` in
          // .yarnrc.yml (covered by the next test) or use
          // `nodeLinker: node-modules`.
          t.todo(
            "Plug'n'Play needs the build script allowed (enableScripts: true)",
          )
        }
        const dir = createProject(pm, 'env-proxy')
        const env = caseEnv(dir, proxy)
        const before = proxyLog().length
        install(dir, env)
        if (pm.scriptsRun) {
          // Downloaded by the install script, before anything else runs
          assert.ok(findBinary(dir), 'the install script did not download')
          assert.ok(
            reachedThroughProxy(proxyLog().slice(before)),
            'the install script did not download through the proxy',
          )
        }
        assertRan(runInProject(dir, env), 'serverless --version')
        assert.ok(findBinary(dir), 'no launcher binary installed')
        assert.ok(
          reachedThroughProxy(proxyLog().slice(before)),
          'the proxy saw no download',
        )
      },
    )

    test(
      'downloads the binary during install once the install script is allowed',
      {
        timeout: TIMEOUT * 2,
        skip: !pm.allowScripts && 'install scripts always run',
      },
      () => {
        const dir = createProject(pm, 'scripts-allowed')
        pm.allowScripts(dir)
        const env = caseEnv(dir, proxy)
        const before = proxyLog().length
        const result = run(pm.install, { cwd: dir, env })
        assert.equal(result.status, 0, result.output)
        if (!findBinary(dir)) {
          const report = pm.ignoredBuilds
            ? run(pm.ignoredBuilds, { cwd: dir, env }).output
            : ''
          assert.fail(
            `the install script did not download the binary:\n${result.output}\n` +
              `installed at: ${describeInstall(dir)}\n${report}`,
          )
        }
        assert.ok(
          reachedThroughProxy(proxyLog().slice(before)),
          'the proxy saw no download',
        )
        assertRan(runInProject(dir, env), 'serverless --version')
      },
    )

    test(
      'installs and runs without a proxy',
      {
        timeout: TIMEOUT * 2,
        skip: !directInternet && 'no direct internet access',
      },
      (t) => {
        if (pm.layout === 'pnp') {
          t.todo(
            "Plug'n'Play needs the build script allowed (enableScripts: true)",
          )
        }
        const dir = createProject(pm, 'direct')
        const env = caseEnv(dir)
        const before = proxyLog().length
        const authBefore = authProxyLog().length
        install(dir, env)
        assertRan(runInProject(dir, env), 'serverless --version')
        assert.ok(findBinary(dir), 'no launcher binary installed')
        assert.equal(proxyLog().slice(before), '', 'a proxy was used')
        assert.equal(authProxyLog().slice(authBefore), '', 'a proxy was used')
      },
    )

    test(
      'installs globally and runs through a proxy',
      { timeout: TIMEOUT * 2, skip: !pm.global && 'no global installs' },
      () => {
        const dir = createProject(pm, 'global')
        const env = caseEnv(dir, proxy)
        const before = proxyLog().length
        assertInstalled(run(pm.global, { cwd: dir, env }), 'global install')
        assertRan(
          run('serverless --version', { cwd: dir, env }),
          'serverless --version',
        )
        // The binary is only ever written into the installed package, and
        // this case installs nothing locally, so finding it in the case's
        // folder shows this global install ran, not a `serverless` found
        // elsewhere on PATH (Bun puts its global packages next to the npm
        // prefix, so not only under .global)
        assert.ok(findBinary(dir), 'no launcher binary in the global install')
        assert.ok(
          reachedThroughProxy(proxyLog().slice(before)),
          'the proxy saw no download',
        )
      },
    )

    test(
      'runs once without installing, through a proxy',
      { timeout: TIMEOUT * 2, skip: !pm.exec && 'no one-off runs' },
      (t) => {
        if (pm.layout === 'pnp') {
          // `yarn dlx` runs in a throwaway Plug'n'Play project with build
          // scripts disabled, so the package stays in its zip archive. Users
          // run it as `YARN_ENABLE_SCRIPTS=true yarn dlx serverless`.
          t.todo("yarn dlx needs YARN_ENABLE_SCRIPTS=true under Plug'n'Play")
        }
        const dir = createProject(pm, 'exec')
        const env = { ...caseEnv(dir, proxy), ...freshCaches(dir) }
        const before = proxyLog().length
        assertRan(run(pm.exec, { cwd: dir, env }), pm.exec)
        assert.ok(
          reachedThroughProxy(proxyLog().slice(before)),
          'the proxy saw no download',
        )
      },
    )

    test(
      'uses a proxy with credentials',
      {
        timeout: TIMEOUT * 2,
        skip: pm.layout === 'pnp' && "covered by the other Plug'n'Play tests",
      },
      () => {
        const dir = createProject(pm, 'auth-proxy')
        const env = caseEnv(dir, authProxy)
        const before = authProxyLog().length
        install(dir, env)
        assertRan(runInProject(dir, env), 'serverless --version')
        const log = authProxyLog().slice(before)
        assert.ok(
          reachedThroughProxy(log),
          `the proxy saw no authenticated download:\n${log}`,
        )
      },
    )

    test(
      'keeps the install working and reports a clear error when the proxy is unreachable',
      {
        timeout: TIMEOUT * 2,
        skip: pm.layout === 'pnp' && "covered by the other Plug'n'Play tests",
      },
      () => {
        const dir = createProject(pm, 'dead-proxy')
        // Nothing listens on port 9 (discard); connections are refused
        const env = caseEnv(dir, 'http://127.0.0.1:9')
        // The install itself must succeed: the binary download is retried on
        // first run
        install(dir, env)
        const result = runInProject(dir, env)
        assert.notEqual(result.status, 0, result.output)
        assert.match(
          result.output,
          /Could not download the Serverless Framework binary: .*(ECONNREFUSED|EADDRNOTAVAIL|connect)/,
        )
        assert.equal(findBinary(dir), undefined)
      },
    )

    test(
      'downloads through a proxy set only in .npmrc',
      {
        timeout: TIMEOUT * 2,
        skip: !pm.readsNpmrc && 'does not read .npmrc',
      },
      (t) => {
        if (!pm.scriptsRun) {
          // npm hands its .npmrc proxy settings only to processes it starts.
          // With the install script blocked, the binary is downloaded on the
          // first run, and a `serverless` started directly (not through
          // npm/npx) does not see them. Users behind a proxy set
          // HTTPS_PROXY, or allow the install script
          // (`npm install-scripts approve serverless`, pnpm `allowBuilds`)
          // so the download happens during install.
          t.todo(
            'a directly started first run does not see .npmrc proxy settings; set HTTPS_PROXY or allow the install script',
          )
        }
        const dir = createProject(pm, 'npmrc-proxy')
        fs.appendFileSync(
          path.join(dir, '.npmrc'),
          `https-proxy=${proxy}\nproxy=${proxy}\nnoproxy=${noProxy()}\n`,
        )
        const env = caseEnv(dir)
        const before = proxyLog().length
        install(dir, env)
        if (!findBinary(dir)) {
          // Started the way users start a CLI: directly, not through npm
          run(
            pm.runInProject
              ? path.join('node_modules', '.bin', 'serverless') + ' --version'
              : pm.run,
            {
              cwd: dir,
              env,
            },
          )
        }
        assert.ok(findBinary(dir), 'no launcher binary')
        assert.ok(
          reachedThroughProxy(proxyLog().slice(before)),
          'the binary was not downloaded through the proxy',
        )
      },
    )
  })
}
