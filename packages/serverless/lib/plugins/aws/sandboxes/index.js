'use strict'

import path from 'path'
import fsPromises from 'fs/promises'
import { defineSandboxesSchema } from './validators/schema.js'
import { validateSandboxes } from './validators/config.js'
import { orchestrate } from './compilation/orchestrator.js'
import { dashboardConsoleUrl } from './compilers/observability.js'
import { uploadArtifact } from './packaging/artifact.js'
import { persistArtifacts, readUploadManifest } from './packaging/persist.js'

/**
 * Serverless Framework internal plugin for AWS Lambda MicroVM sandboxes.
 *
 * Enables defining named sandboxes (MicroVM-backed Lambda resources) directly
 * in serverless.yml configuration files via the top-level `sandboxes` property.
 *
 * Hook lifecycle:
 *   before:package:initialize  → validate configuration (fast, synchronous)
 *   before:package:finalize    → compile CloudFormation resources (idempotent);
 *                                 zip local artifacts to the package dir + manifest (no S3)
 *   before:deploy:deploy       → upload the packaged artifacts (from disk) to S3
 *
 * Artifacts are written to disk at package time and uploaded from disk at deploy
 * time — the same hand-off the framework uses for function zips — so `serverless
 * package` stays offline and `serverless deploy --package <dir>` works.
 */
class ServerlessSandboxes {
  /**
   * Determines if this plugin should be loaded based on configuration.
   */
  static shouldLoad({ serverless }) {
    const cfg = serverless?.configurationInput?.sandboxes
    return Boolean(cfg && Object.keys(cfg).length > 0)
  }

  constructor(serverless, options, { log }, deps = {}) {
    this.serverless = serverless
    this.options = options
    this.log = log
    this.provider = serverless.getProvider('aws')
    this.resourcesCompiled = false
    // Injectable fs/promises-like for tests; defaults to the real module.
    this._fs = deps.fs || fsPromises

    defineSandboxesSchema(serverless)

    this.hooks = {
      'before:package:initialize': () => this.validate(),
      'before:deploy:deploy': () => this.packageArtifacts(),
      'before:package:finalize': () => this.compile(),
    }
  }

  getSandboxesConfig() {
    return (
      this.serverless.service.sandboxes ||
      this.serverless.configurationInput?.sandboxes ||
      null
    )
  }

  getContext() {
    return {
      serviceName: this.serverless.service.service,
      stage: this.provider.getStage(),
      region: this.provider.getRegion(),
      deploymentBucket: this.serverless.service.provider?.deploymentBucket,
      // Absolute dir containing serverless.yml — local artifact paths resolve
      // against this, not process.cwd().
      serviceDir: this.serverless.serviceDir,
    }
  }

  /**
   * Validate sandbox configuration. Called at before:package:initialize so
   * schema errors surface early before any I/O.
   */
  validate() {
    const sandboxesConfig = this.getSandboxesConfig()
    if (!sandboxesConfig) return

    const errors = []
    validateSandboxes(sandboxesConfig, {
      throwError: (msg) => errors.push(msg),
    })
    if (errors.length > 0) {
      throw new this.serverless.classes.Error(errors.join('\n'))
    }
  }

  /**
   * Resolve the package output directory, mirroring the package/deploy commands:
   * the --package option, else service.package.path, else <serviceDir>/.serverless.
   */
  getPackageDir() {
    const configured =
      this.options?.package || this.serverless.service.package?.path
    const serviceDir = this.serverless.serviceDir || '.'
    if (!configured) return path.join(serviceDir, '.serverless')
    return path.isAbsolute(configured)
      ? configured
      : path.join(serviceDir, configured)
  }

  /**
   * Upload the packaged local-dir artifacts to S3. Called at before:deploy:deploy.
   *
   * Reads the upload manifest written into the package directory at package time
   * (not in-memory state), so this works for both `serverless deploy` and the
   * separate-process `serverless deploy --package <dir>`. s3:// pass-through
   * artifacts produce no manifest entry and are skipped.
   */
  async packageArtifacts() {
    const packageDir = this.getPackageDir()
    const manifest = await readUploadManifest({ packageDir, fs: this._fs })
    if (manifest.length === 0) return

    const bucket = await this.provider.getServerlessDeploymentBucketName()
    const deploymentBucketObject =
      this.serverless.service.provider?.deploymentBucketObject

    await Promise.all(
      manifest.map(async ({ key, file }) =>
        uploadArtifact({
          provider: this.provider,
          bucket,
          key,
          body: await this._fs.readFile(path.join(packageDir, file)),
          deploymentBucketObject,
        }),
      ),
    )
  }

  /**
   * Compile all sandbox CloudFormation resources into the provider template.
   * Idempotent: subsequent calls are no-ops once resourcesCompiled is set.
   *
   * Local-dir artifacts are zipped and written (with a manifest) into the
   * package directory; the actual S3 upload happens in packageArtifacts().
   */
  async compile() {
    if (this.resourcesCompiled) return

    const sandboxesConfig = this.getSandboxesConfig()
    if (!sandboxesConfig) return

    const ctx = this.getContext()
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    const pendingUploads = await orchestrate({
      sandboxesConfig,
      ctx,
      template,
      provider: this.provider,
      serverless: this.serverless,
      log: this.log,
    })

    // Persist local-dir artifacts + a manifest into the package directory so the
    // deploy step uploads them from disk (matching how function zips are handed
    // from `package` to `deploy`, and enabling `deploy --package`).
    await persistArtifacts({
      packageDir: this.getPackageDir(),
      pendingUploads,
      fs: this._fs,
    })

    // Surface the CloudWatch dashboard URL in the post-deploy summary (alongside
    // endpoints/functions). The `SandboxesDashboard` resource exists only when
    // observability is enabled; the URL comes from the dashboard compiler's own
    // naming helper, so it can't drift from the deployed DashboardName. Only on
    // `deploy` — a bare `package` doesn't create the dashboard.
    if (
      template.Resources.SandboxesDashboard &&
      typeof this.serverless.addServiceOutputSection === 'function' &&
      this.serverless.processedInput?.commands?.join(' ') === 'deploy'
    ) {
      this.serverless.addServiceOutputSection(
        'dashboard',
        dashboardConsoleUrl(ctx),
      )
    }

    this.resourcesCompiled = true
  }
}

export default ServerlessSandboxes
