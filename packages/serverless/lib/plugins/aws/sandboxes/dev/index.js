'use strict'

import path from 'path'
import fs from 'fs'
import chokidar from 'chokidar'
import { DockerClient } from '@serverless/util/src/docker/index.js'
import ServerlessError from '../../../../serverless-error.js'

class SandboxesDevMode {
  constructor(serverless, options, pluginUtils, deps = {}) {
    this.serverless = serverless
    this.options = options || {}
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress
    this.docker = deps.docker || new DockerClient()
    this.fileExists = deps.fileExists || ((p) => fs.existsSync(p))
    this.onSignal = deps.onSignal || ((sig, h) => process.on(sig, h))
    this.createWatcher =
      deps.createWatcher || ((p, opts) => chokidar.watch(p, opts))
    this.sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.createIamEmulation = deps.createIamEmulation || null
    this.startControlPlane =
      deps.startControlPlane ||
      (async (args) => {
        const { startControlPlane } =
          await import('./api-emulator/control-plane.js')
        return startControlPlane(args)
      })
    this.makeContainerManager =
      deps.makeContainerManager ||
      ((args) =>
        import('./api-emulator/container-manager.js').then(
          (m) => new m.ContainerManager(args),
        ))
    this.makeRegistry =
      deps.makeRegistry ||
      ((args) =>
        import('./api-emulator/registry.js').then(
          (m) => new m.EmulatorRegistry(args),
        ))
    this.controlPlane = null
    this.watcher = null
    this.ctx = null
    this.iam = null
    this.credsEnv = null
    this.isRebuilding = false
    this.pendingRebuild = false
    this.shuttingDown = false
  }

  getSandboxesConfig() {
    return (
      this.serverless.service.sandboxes ||
      this.serverless.configurationInput?.sandboxes ||
      null
    )
  }

  resolveSandboxName() {
    const sandboxes = this.getSandboxesConfig()
    if (!sandboxes || Object.keys(sandboxes).length === 0) {
      throw new ServerlessError(
        'No sandboxes defined in serverless.yml under `sandboxes`.',
        'NO_SANDBOXES_DEFINED',
        { stack: false },
      )
    }
    const names = Object.keys(sandboxes)
    if (this.options.sandbox) {
      if (!sandboxes[this.options.sandbox]) {
        throw new ServerlessError(
          `Sandbox '${this.options.sandbox}' not found. Available: ${names.join(', ')}`,
          'SANDBOX_NOT_FOUND',
          { stack: false },
        )
      }
      return this.options.sandbox
    }
    if (names.length === 1) return names[0]
    throw new ServerlessError(
      `Multiple sandboxes defined (${names.join(', ')}); choose one with --sandbox <name>.`,
      'SANDBOX_TARGET_AMBIGUOUS',
      { stack: false },
    )
  }

  async run() {
    const name = this.resolveSandboxName()
    const cfg = this.getSandboxesConfig()[name]
    const contextPath = this.resolveArtifactDir(cfg)
    // Stable, customizable control-plane port — the address the SDK/launcher target. Constant by
    // default so the endpoint doesn't change between runs (unlike the per-instance proxy ports,
    // which are dynamic); override with --port. Defaults to 9100.
    const controlPlanePort = Number(this.options.port) || 9100
    const platform = process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64'
    this.ctx = {
      name,
      cfg,
      contextPath,
      controlPlanePort,
      platform,
      imageUri: `serverless-sandbox-dev/${this.serverless.service.service}-${name}:latest`,
      containerName: `sls-sandbox-dev-${this.serverless.service.service}-${name}`,
    }

    // Keep-alive resolver — set BEFORE any await so an early SIGINT still resolves run().
    const exitPromise = new Promise((resolve) => {
      this._resolveExit = resolve
    })

    // Fail fast if Docker is unreachable.
    try {
      await this.docker.ensureIsRunning()
    } catch (err) {
      throw new ServerlessError(
        `Docker is required for 'serverless dev --sandbox'; could not reach the Docker daemon: ${err.message}`,
        'SANDBOX_DEV_DOCKER_UNAVAILABLE',
        { stack: false },
      )
    }

    // IAM emulation: assume the sandbox's real execution role unless --no-assume-role.
    if (this.options['assume-role'] !== false) {
      const factory =
        this.createIamEmulation ||
        (async () => {
          const { default: SandboxIamEmulation } =
            await import('./iam-emulation.js')
          return new SandboxIamEmulation({
            provider: this.serverless.getProvider('aws'),
            logger: this.logger,
          })
        })
      try {
        this.iam = await factory()
        this.credsEnv = await this.iam.setUp(name)
        if (this.credsEnv) {
          this.logger.notice(`Running sandbox "${name}" as its execution role`)
        }
      } catch (err) {
        this.logger.debug?.(`IAM emulation unavailable: ${err.message}`)
        this.iam = null
        this.credsEnv = null
      }
    }

    await this.build()

    const registry = await this.makeRegistry({
      sandboxName: name,
      minimumMemoryInMiB: this.ctx.cfg.memory || 2048,
      imageArn: `arn:aws:lambda:local:000000000000:microvm-image:${this.serverless.service.service}-${name}`,
    })
    const self = this
    const containerManager = await this.makeContainerManager({
      docker: this.docker,
      imageUri: this.ctx.imageUri,
      serviceName: this.serverless.service.service,
      sandboxName: name,
      get env() {
        return { ...(self.ctx.cfg.environment || {}), ...(self.credsEnv || {}) }
      },
    })
    // Lifecycle hooks: fire only those declared in the sandbox config; `ready` auto-enables
    // when any runtime hook is set (mirrors the framework's hook handling).
    const RUNTIME_HOOKS = ['run', 'suspend', 'resume', 'terminate']
    const declared = Object.keys(this.ctx.cfg.hooks || {}).filter(
      (h) => this.ctx.cfg.hooks[h],
    )
    const enabledHooks = new Set(declared)
    if (RUNTIME_HOOKS.some((h) => enabledHooks.has(h)))
      enabledHooks.add('ready')
    const { createHookFirer } = await import('./api-emulator/hooks.js')
    const fireHook = createHookFirer({ enabledHooks, logger: this.logger })
    try {
      this.controlPlane = await this.startControlPlane({
        registry,
        containerManager,
        fireHook,
        port: this.ctx.controlPlanePort,
      })
    } catch (err) {
      if (err?.code === 'EADDRINUSE') {
        throw new ServerlessError(
          `Port ${this.ctx.controlPlanePort} is already in use for the local MicroVMs API. ` +
            `Free it, or pick another with: serverless dev --sandbox ${name} --port <port>.`,
          'SANDBOX_DEV_PORT_IN_USE',
          { stack: false },
        )
      }
      throw err
    }
    this.progress?.remove?.()
    this.logger.notice(
      `Local MicroVMs API: ${this.controlPlane.url} (Ctrl-C to stop)`,
    )
    this.logger.notice(
      `Point your code at it: export AWS_ENDPOINT_URL_LAMBDA_MICROVMS=${this.controlPlane.url} ` +
        `(or pass endpoint: '${this.controlPlane.url}' to LambdaMicrovmsClient)`,
    )

    this.onSignal('SIGINT', () => this.shutdown())
    this.onSignal('SIGTERM', () => this.shutdown())

    this.startWatcher()
    await exitPromise
  }

  async build() {
    this.progress?.notice?.(`Building sandbox image for "${this.ctx.name}"`)
    await this.docker.buildImage({
      containerName: this.ctx.containerName,
      containerPath: this.ctx.contextPath,
      imageUri: this.ctx.imageUri,
      platform: this.ctx.platform,
    })
  }

  async shutdown() {
    if (this.shuttingDown) return
    this.shuttingDown = true
    if (this.watcher) await this.watcher.close().catch(() => {})
    if (this.controlPlane) await this.controlPlane.shutdown().catch(() => {})
    if (this.iam) await this.iam.cleanUp().catch(() => {})
    this._resolveExit?.()
  }

  async performRebuild() {
    // Collapse rapid bursts: if a rebuild is in flight, queue exactly one more.
    if (this.isRebuilding) {
      this.pendingRebuild = true
      return
    }
    this.isRebuilding = true
    try {
      await this.sleep(100) // let the filesystem settle before reading sources
      this.progress?.notice?.('Rebuilding sandbox image…')
      await this.build()
      this.progress?.remove?.()
      // Abort if SIGINT fired while we were building — do not touch the container.
      if (this.shuttingDown) return
      if (this.iam && this.credsEnv && this.iam.credentialsExpiring()) {
        const refreshed = await this.iam.refresh()
        if (refreshed) this.credsEnv = refreshed
      }
      this.logger.notice(
        'Rebuild complete. New RunMicrovm calls will use the updated image.',
      )
    } catch (err) {
      this.progress?.remove?.()
      // Previous container keeps running; the loop survives.
      this.logger.error(`Rebuild failed: ${err.message}`)
    } finally {
      this.isRebuilding = false
      if (this.pendingRebuild && !this.shuttingDown) {
        this.pendingRebuild = false
        await this.performRebuild()
      }
    }
  }

  _isIgnored(filePath, stats) {
    // chokidar reports OS-native separators; normalize to '/' so the directory
    // matches below work on Windows (where paths use '\') too.
    const p = filePath.replace(/\\/g, '/')
    const EXCLUDED = [
      '/.serverless/',
      '/node_modules/',
      '/.git/',
      '/__pycache__/',
      '/.venv/',
      '/venv/',
      '/.pytest_cache/',
      '/.mypy_cache/',
      '/coverage/',
    ]
    if (EXCLUDED.some((dir) => p.includes(dir))) return true
    if (
      stats?.isFile() &&
      (p.endsWith('.test.js') ||
        p.endsWith('.spec.js') ||
        p.endsWith('_test.py') ||
        p.endsWith('.test.py'))
    ) {
      return true
    }
    return false
  }

  startWatcher() {
    this.watcher = this.createWatcher(this.ctx.contextPath, {
      ignored: (filePath, stats) => this._isIgnored(filePath, stats),
      ignoreInitial: true,
      followSymlinks: false,
      // chokidar v4 dropped fsevents; polling avoids EMFILE on macOS.
      usePolling: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })
    this.watcher.on('all', async (event, filePath) => {
      if (this.shuttingDown) return
      const rel = path.relative(this.ctx.contextPath, filePath)
      this.logger.notice(`Detected ${event} in ${rel}. Rebuilding...`)
      await this.performRebuild()
    })
  }

  resolveArtifactDir(cfg) {
    const artifact = cfg.artifact
    if (!artifact || typeof artifact !== 'string') {
      throw new ServerlessError(
        `Sandbox is missing the required "artifact" property in serverless.yml. ` +
          `Set "artifact" to a local directory that contains a Dockerfile.`,
        'SANDBOX_DEV_ARTIFACT_MISSING',
        { stack: false },
      )
    }
    if (artifact.startsWith('s3://')) {
      throw new ServerlessError(
        `'dev' needs local source, but artifact is an s3:// zip (${artifact}). ` +
          `Use a local directory containing a Dockerfile for the dev loop.`,
        'SANDBOX_DEV_NO_LOCAL_SOURCE',
        { stack: false },
      )
    }
    const dir = path.isAbsolute(artifact)
      ? artifact
      : path.resolve(this.serverless.serviceDir || '.', artifact)
    if (!this.fileExists(dir)) {
      throw new ServerlessError(
        `Artifact directory not found: "${dir}".`,
        'SANDBOX_DEV_ARTIFACT_DIR_NOT_FOUND',
        { stack: false },
      )
    }
    if (!this.fileExists(path.join(dir, 'Dockerfile'))) {
      throw new ServerlessError(
        `No Dockerfile found in "${dir}". 'dev' builds the sandbox image from a Dockerfile.`,
        'SANDBOX_DEV_NO_DOCKERFILE',
        { stack: false },
      )
    }
    return dir
  }
}

export default SandboxesDevMode
