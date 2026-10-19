'use strict'

import { defineWebAppsSchema } from './validators/schema.js'
import { validateWebApps } from './validators/config.js'
import { validateWebAppDomains } from './validators/domains.js'
import {
  resolveArtifactsDir,
  resolvePackageDir,
  uploadPackagedArtifacts,
} from '../lib/content-addressed-artifacts.js'
import {
  collectWebAppArtifacts,
  persistWebAppArtifacts,
} from './packaging/artifacts.js'
import { compileWebApps } from './compilation/orchestrator.js'
import {
  getWebAppTimeoutWarnings,
  listWebAppDomains,
} from './compilers/domain.js'
import { MANIFEST_KIND } from './constants.js'
import { findStackWebAppLogGroups, removeWebAppLogGroups } from './remove.js'
import { getWebAppsConfig, serviceHasWebApps } from '../lib/web-apps.js'
import { hasExternalIamPerFunctionPlugin } from '../package/lib/uses-dedicated-per-function-role.js'

/**
 * Serverless Framework internal plugin for AWS Lambda Web Functions, configured
 * under the top-level `webApps` property: each entry is an HTTP server that
 * Lambda runs behind its own endpoint.
 *
 * Hook lifecycle:
 *   before:package:initialize → validate the rules that need the whole service
 *                               and the provider.domain(s) entries with webApp
 *                               (the schema covers each entry's shape)
 *   package:compileFunctions  → key each web app's zip by its content, compile
 *                               the CloudFormation resources (warning about
 *                               timeouts CloudFront cuts short), and write the
 *                               zips with an upload manifest
 *   before:deploy:deploy      → the same timeout warnings, when this process
 *                               did not package (deploy --package)
 *   aws:deploy:deploy:uploadArtifacts → upload the zips the bucket does not
 *                               have yet (after createStack, so a new
 *                               in-stack bucket exists)
 *   before:remove:remove      → find the web apps' log groups the stack holds
 *   after:remove:remove       → delete those log groups again, as late log
 *                               delivery can recreate them after the stack
 *                               was deleted
 *   before:deploy:function:initialize → reject a web app name: a revision
 *                               created outside CloudFormation would drift
 *                               the stack (before deploy function's own
 *                               missing-function check)
 */
class ServerlessWebApps {
  constructor(serverless, options, { log } = {}) {
    this.serverless = serverless
    this.options = options
    this.log = log
    this.provider = serverless.getProvider('aws')

    defineWebAppsSchema(serverless)

    this.hooks = {
      'before:package:initialize': () => this.validate(),
      'package:compileFunctions': () => this.compile(),
      'before:deploy:deploy': () => this.warnAboutDomainTimeouts(),
      'aws:deploy:deploy:uploadArtifacts': () => this.uploadArtifacts(),
      'before:remove:remove': () => this.findLogGroupsToRemove(),
      'after:remove:remove': () => this.removeLogGroups(),
      'before:deploy:function:initialize': () => this.rejectDeployFunction(),
    }
  }

  getContext() {
    return {
      serviceName: this.serverless.service.service,
      stage: this.provider.getStage(),
      region: this.provider.getRegion(),
      // Absolute dir containing serverless.yml; entry paths resolve against it.
      serviceDir: this.serverless.serviceDir,
    }
  }

  getPackageDir() {
    return resolvePackageDir({
      options: this.options,
      service: this.serverless.service,
      serviceDir: this.serverless.serviceDir,
    })
  }

  /**
   * Where packaging writes artifacts during `package`:
   * `<serviceDir>/.serverless`. The package step moves its contents to the
   * `--package` directory at the end, so zips and the manifest written here
   * end up next to the other artifacts.
   */
  getArtifactsDir() {
    return resolveArtifactsDir({ serviceDir: this.serverless.serviceDir })
  }

  /**
   * Compile each web app's resources into the template and hand its zip to
   * the deploy step: the zip moves to its content-addressed name and is
   * listed in `webapps-uploads.json`, so `package` stays offline.
   */
  async compile() {
    if (!serviceHasWebApps(this.serverless)) return
    const webApps = getWebAppsConfig(this.serverless)

    const packageDir = this.getArtifactsDir()
    const artifacts = await collectWebAppArtifacts({
      serverless: this.serverless,
      provider: this.provider,
      webApps,
      packageDir,
    })
    compileWebApps({
      webApps,
      ctx: this.getContext(),
      template: this.serverless.service.provider.compiledCloudFormationTemplate,
      artifacts,
      provider: this.provider,
      serverless: this.serverless,
      log: this.log,
    })
    // The compile step logged the timeout warnings; the deploy that follows
    // in this process does not repeat them.
    this.timeoutWarningsLogged = true
    await persistWebAppArtifacts({ packageDir, artifacts })
  }

  /**
   * Warn about each web app behind a custom domain that can run longer than
   * CloudFront waits for its response, unless the package step in this
   * process already did. Reads the configuration only, so `deploy --package`
   * warns too.
   */
  warnAboutDomainTimeouts() {
    if (!serviceHasWebApps(this.serverless)) return
    if (this.timeoutWarningsLogged) return
    this.timeoutWarningsLogged = true
    const providerConfig = this.serverless.service.provider || {}
    for (const warning of getWebAppTimeoutWarnings({
      domainEntries: listWebAppDomains(providerConfig),
      webApps: getWebAppsConfig(this.serverless),
      providerConfig,
    })) {
      this.log.warning(warning)
    }
  }

  /**
   * Upload the zips listed in `webapps-uploads.json` from the package
   * directory (so `deploy --package <dir>` works in a separate process). A key
   * names its content, so a zip the bucket already has is not uploaded again.
   * Nothing is uploaded when change detection skips the deploy.
   */
  async uploadArtifacts() {
    if (!serviceHasWebApps(this.serverless)) return
    const providerConfig = this.serverless.service.provider
    if (providerConfig?.shouldNotDeploy) return

    await uploadPackagedArtifacts({
      provider: this.provider,
      packageDir: this.getPackageDir(),
      kind: MANIFEST_KIND,
      label: 'web app artifact',
      errorCode: 'WEB_APPS_ARTIFACT_PATH_ESCAPE',
      missingErrorCode: 'WEB_APPS_ARTIFACT_MISSING',
      deploymentBucketObject: providerConfig?.deploymentBucketObject,
      log: this.log,
    })
  }

  /**
   * Before the stack is deleted, find the web apps' log groups it holds: only
   * those belong to this service.
   */
  async findLogGroupsToRemove() {
    if (!serviceHasWebApps(this.serverless)) return
    this.logGroupsToRemove = await findStackWebAppLogGroups({
      provider: this.provider,
      webApps: getWebAppsConfig(this.serverless),
      ctx: this.getContext(),
      stackName: this.provider.naming.getStackName(),
      log: this.log,
    })
  }

  /**
   * Delete those log groups once the stack is deleted: lines a still-running
   * environment delivers late make Lambda recreate them after CloudFormation
   * removed them.
   */
  async removeLogGroups() {
    if (!this.logGroupsToRemove?.length) return
    await removeWebAppLogGroups({
      provider: this.provider,
      logGroupNames: this.logGroupsToRemove,
      log: this.log,
    })
  }

  /**
   * `deploy function -f <name>` deploys functions only: a web app deploys
   * with `serverless deploy`.
   */
  rejectDeployFunction() {
    const name = this.options?.function
    if (!name || !Object.hasOwn(getWebAppsConfig(this.serverless), name)) {
      return
    }
    throw new this.serverless.classes.Error(
      `"${name}" is a web app. Deploy it with serverless deploy.`,
      'WEB_APPS_DEPLOY_FUNCTION',
      { stack: false },
    )
  }

  /**
   * Validate the rules that need the whole service, and the
   * `provider.domain(s)` entries that target web apps, and throw every problem
   * as one error. Domain entries are checked even in a service without web
   * apps, where any `webApp` they name is unknown. `provider.iam` tells
   * whether a web app's own role would drop provider statements. `provider.timeout` is read
   * as the user set it: the Framework's 6-second function default is applied
   * per function, not to the provider.
   */
  validate() {
    const { functions, provider = {} } = this.serverless.service
    const webApps = getWebAppsConfig(this.serverless)
    const domainMessages = validateWebAppDomains({
      domain: provider.domain,
      domains: provider.domains,
      webApps,
    })
    if (!serviceHasWebApps(this.serverless) && domainMessages.length === 0) {
      return
    }

    const { serviceName, stage, serviceDir } = this.getContext()
    const messages = validateWebApps({
      webApps,
      functions,
      provider: {
        timeout: provider.timeout,
        environment: provider.environment,
        iam: provider.iam,
      },
      serviceName,
      stage,
      serviceDir,
      iamRolesPerFunctionPluginLoaded: hasExternalIamPerFunctionPlugin(
        this.serverless,
      ),
    }).concat(domainMessages)
    if (messages.length > 0) {
      throw new this.serverless.classes.Error(
        messages.join('\n'),
        'WEB_APPS_VALIDATION_ERROR',
        { stack: false },
      )
    }
  }
}

export default ServerlessWebApps
