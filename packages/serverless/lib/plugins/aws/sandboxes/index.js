'use strict'

import { defineSandboxesSchema } from './validators/schema.js'
import { validateSandboxes } from './validators/config.js'
import { orchestrate } from './compilation/orchestrator.js'
import { uploadArtifact } from './packaging/artifact.js'

/**
 * Serverless Framework internal plugin for AWS Lambda MicroVM sandboxes.
 *
 * Enables defining named sandboxes (MicroVM-backed Lambda resources) directly
 * in serverless.yml configuration files via the top-level `sandboxes` property.
 *
 * Hook lifecycle:
 *   before:package:initialize  → validate configuration (fast, synchronous)
 *   before:package:finalize    → compile CloudFormation resources (idempotent);
 *                                 zip local artifacts and cache them (no S3)
 *   before:deploy:deploy       → upload cached local artifacts to S3
 */
class ServerlessSandboxes {
  /**
   * Determines if this plugin should be loaded based on configuration.
   */
  static shouldLoad({ serverless }) {
    const cfg = serverless?.configurationInput?.sandboxes
    return Boolean(cfg && Object.keys(cfg).length > 0)
  }

  constructor(serverless, options, { log }) {
    this.serverless = serverless
    this.options = options
    this.log = log
    this.provider = serverless.getProvider('aws')
    this.resourcesCompiled = false

    /**
     * Pending uploads populated by compile() and consumed by packageArtifacts().
     * Map of sandbox name → { key: string, zipBuffer: Buffer }
     * @type {Map<string, { key: string, zipBuffer: Buffer }>}
     */
    this._pendingUploads = new Map()

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
   * Upload any local code artifacts to S3. Called at before:deploy:deploy so
   * artifacts are staged before CloudFormation executes.
   *
   * The zip buffers and S3 keys were computed during compile() and cached on
   * `this._pendingUploads`.  s3:// pass-through artifacts produce no entry in
   * the cache and are skipped here.
   */
  async packageArtifacts() {
    if (this._pendingUploads.size === 0) return

    const bucket = await this.provider.getServerlessDeploymentBucketName()
    const deploymentBucketObject =
      this.serverless.service.provider?.deploymentBucketObject

    const uploads = []
    for (const [, { key, zipBuffer }] of this._pendingUploads) {
      uploads.push(
        uploadArtifact({
          provider: this.provider,
          bucket,
          key,
          body: zipBuffer,
          deploymentBucketObject,
        }),
      )
    }

    await Promise.all(uploads)
  }

  /**
   * Compile all sandbox CloudFormation resources into the provider template.
   * Idempotent: subsequent calls are no-ops once resourcesCompiled is set.
   *
   * Local-dir artifacts are zipped and their keys+buffers are cached on
   * `this._pendingUploads`; the actual S3 upload happens in packageArtifacts().
   */
  async compile() {
    if (this.resourcesCompiled) return

    const sandboxesConfig = this.getSandboxesConfig()
    if (!sandboxesConfig) return

    const ctx = this.getContext()
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    this._pendingUploads = await orchestrate({
      sandboxesConfig,
      ctx,
      template,
      provider: this.provider,
      serverless: this.serverless,
      log: this.log,
    })

    this.resourcesCompiled = true
  }
}

export default ServerlessSandboxes
