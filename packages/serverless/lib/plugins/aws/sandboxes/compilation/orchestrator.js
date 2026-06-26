'use strict'

import ServerlessError from '../../../../serverless-error.js'
import { validateSandboxes } from '../validators/config.js'
import { getLogicalId, getResourceName } from '../utils/naming.js'
import { resolveBaseImage } from '../utils/baseImage.js'
import { computeCodeArtifact } from '../packaging/artifact.js'
import {
  shouldGenerateRole,
  resolveRole,
  generateBuildRole,
  generateExecutionRole,
  generateOperatorRole,
} from '../iam/policies.js'
import { compileImage } from '../compilers/image.js'
import { compileNetworkConnector } from '../compilers/networkConnector.js'
import {
  resolveObservability,
  compileLogGroup,
  compileMetricFilters,
  compileAlarms,
  buildDashboardWidgets,
  compileServiceDashboard,
} from '../compilers/observability.js'

/**
 * The well-known AWS-managed INTERNET_EGRESS connector ARN prefix.
 * The region is always the region where the image lives.
 *
 * Format: arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:INTERNET_EGRESS
 *
 * We derive it from ctx.region so tests can pass whatever region they like.
 */
function internetEgressArn(region) {
  return `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`
}

// CloudFormation types created for a sandbox that do NOT support a Tags property.
const TAG_UNSUPPORTED_TYPES = new Set(['AWS::Logs::MetricFilter'])

/**
 * Apply the sandbox's `tags` to each given resource that supports Tags.
 * Tags use the standard `[{ Key, Value }]` shape across all taggable types here.
 *
 * @param {object} resources   - template.Resources
 * @param {string[]} logicalIds - ids of resources created for this sandbox
 * @param {object|undefined} tags
 */
function applySandboxTags(resources, logicalIds, tags) {
  const entries = Object.entries(tags || {})
  if (entries.length === 0) return
  const Tags = entries.map(([Key, Value]) => ({ Key, Value: String(Value) }))
  for (const id of logicalIds) {
    const r = resources[id]
    if (!r || TAG_UNSUPPORTED_TYPES.has(r.Type)) continue
    r.Properties = r.Properties || {}
    r.Properties.Tags = Tags
  }
}

/**
 * Build the CFN value for CodeArtifact.Uri for a local-dir sandbox.
 *
 * When the user specifies a local directory, we don't know the deployment
 * bucket name at compile time (it may be a CFN-managed resource named
 * `ServerlessDeploymentBucket`).  We mirror the pattern used for Lambda
 * functions: if `provider.deploymentBucket` is a pre-configured name use it
 * directly; otherwise emit a `{ Ref: 'ServerlessDeploymentBucket' }` intrinsic
 * so CloudFormation resolves it at deploy time.
 *
 * @param {string|undefined} configuredBucket - ctx.deploymentBucket (may be undefined)
 * @param {string}           key              - The content-addressed S3 key
 * @returns CFN intrinsic or literal string suitable for CodeArtifact.Uri
 */
function buildBucketRefUri(configuredBucket, key) {
  const bucketRef = configuredBucket
    ? configuredBucket
    : { Ref: 'ServerlessDeploymentBucket' }

  return { 'Fn::Sub': ['s3://${B}/' + key, { B: bucketRef }] }
}

/**
 * Compile all sandbox resources and merge them into a CloudFormation template.
 *
 * For each named sandbox:
 *   1. Validate configuration.
 *   2. Resolve base image via provider SDK call.
 *   3. Compute the code-artifact (zip + sha256) but do NOT upload — upload
 *      happens at deploy time in `ServerlessSandboxes#packageArtifacts()`.
 *   4. Generate BuildRole and ExecutionRole (unless caller supplies explicit refs).
 *   5. If vpc is configured: generate OperatorRole + compile NetworkConnector.
 *   6. Compile the MicrovmImage resource.
 *      - EgressNetworkConnectors always contains INTERNET_EGRESS (build needs internet).
 *      - When vpc is set the connector is created and its ARN is exposed as a stack Output
 *        for the data-plane run path.
 *   7. Merge all resources + outputs into template.
 *
 * @param {object}   params
 * @param {object}   params.sandboxesConfig - Map of sandbox name → config
 * @param {object}   params.ctx             - Deployment context from ServerlessSandboxes#getContext()
 * @param {object}   params.template        - CloudFormation template object (mutated in place)
 * @param {object}   params.provider        - Serverless AWS provider
 * @param {object}   params.serverless      - Serverless instance
 * @param {object}   params.log             - Logger
 * @param {Function} [params._zipDir]       - Optional zip function override (injected in unit tests)
 * @returns {Map<string, { key: string, zipBuffer: Buffer }>} pendingUploads - cache for deploy hook
 */
export async function orchestrate({
  sandboxesConfig,
  ctx,
  template,
  provider,
  serverless,
  log,
  _zipDir,
}) {
  // Collect validation errors rather than throwing immediately so we surface all issues at once.
  const errors = []
  validateSandboxes(sandboxesConfig, { throwError: (msg) => errors.push(msg) })
  if (errors.length > 0) {
    throw new ServerlessError(errors.join('\n'), 'SANDBOXES_VALIDATION_ERROR')
  }

  const {
    region,
    deploymentBucket: bucket,
    serviceName,
    stage,
    serviceDir,
  } = ctx

  /** @type {Map<string, { key: string, zipBuffer: Buffer }>} */
  const pendingUploads = new Map()

  // Collected per-sandbox dashboard widgets; assembled into ONE service-level
  // dashboard after the loop (one dashboard per service, not per sandbox).
  const dashboardSections = []

  for (const [name, cfg] of Object.entries(sandboxesConfig || {})) {
    log.debug?.(`sandboxes: compiling "${name}"`)

    // Snapshot existing resource ids so we can tag exactly the ones this sandbox
    // adds (see the tag post-pass at the end of the loop body).
    const resourceIdsBefore = new Set(Object.keys(template.Resources))

    // ── Base image ──────────────────────────────────────────────────────────
    // AWS currently publishes exactly one managed base image (al2023-1), so we
    // don't expose a user-facing alias knob — the resolver uses its default.
    // resolveBaseImage still accepts an alias for when AWS ships more images.
    const baseImage = await resolveBaseImage(provider, region)

    // ── Code artifact (compute only — no S3 upload) ─────────────────────────
    const { uri, key, zipBuffer } = await computeCodeArtifact(cfg, {
      serviceName,
      stage,
      name,
      serviceDir,
      zipDir: _zipDir,
    })

    // For local-dir: emit a CFN intrinsic referencing the deployment bucket.
    // For s3://: use the literal URI string.
    //
    // Mirror functions.js: when the framework resolved a concrete deployment
    // bucket (a user-provided bucket OR the global deployment bucket), it
    // records the name on `service.package.deploymentBucket` and DELETES the
    // `ServerlessDeploymentBucket` template resource (generate-core-template).
    // Prefer that resolved name; only fall back to `ctx.deploymentBucket` /
    // the `Ref` for the legacy in-stack bucket where the resource still exists.
    const resolvedBucket =
      serverless?.service?.package?.deploymentBucket || bucket
    const codeArtifactUri =
      uri !== undefined ? uri : buildBucketRefUri(resolvedBucket, key)

    // Cache the pending upload so the deploy hook can perform it.
    if (key !== undefined && zipBuffer !== undefined) {
      pendingUploads.set(name, { key, zipBuffer })
    }

    // ── IAM roles ────────────────────────────────────────────────────────────
    const buildRoleCfg = cfg.iam?.buildRole
    const execRoleCfg = cfg.iam?.executionRole

    const buildRoleLogicalId = getLogicalId(name, 'ImageBuildRole')
    const execRoleLogicalId = getLogicalId(name, 'ImageExecutionRole')

    const buildRoleArn = resolveRole(buildRoleCfg, buildRoleLogicalId)
    const execRoleArn = resolveRole(execRoleCfg, execRoleLogicalId)

    // When the artifact is an s3:// URI the artifact may live in a DIFFERENT
    // bucket than the deployment bucket.  Parse it so generateBuildRole can
    // scope s3:GetObject to the correct bucket.
    let artifactBucket
    if (cfg.artifact && cfg.artifact.startsWith('s3://')) {
      const withoutScheme = cfg.artifact.slice('s3://'.length)
      artifactBucket = withoutScheme.split('/')[0]
    }

    // ── VPC / NetworkConnector ───────────────────────────────────────────────
    let connectorLogicalId
    let operatorRoleLogicalId

    if (cfg.vpc) {
      operatorRoleLogicalId = getLogicalId(name, 'ConnectorOperatorRole')
      connectorLogicalId = getLogicalId(name, 'Connector')
    }

    // ── Observability (resolve first so the image's Logging block knows whether
    //    logging is disabled). Logging is on by default; `logs.enabled: false`
    //    turns it off entirely. ──
    const obs = resolveObservability(cfg.observability)
    const loggingDisabled = !obs.logs.enabled
    const logGroupLogicalId = getLogicalId(name, 'ImageLogGroup')
    const obsCtx = { serviceName, stage, region }
    // The group the MicroVM logs to: a custom `observability.logs.logGroup` or
    // the default. Threaded to the image (Logging) and to the IAM logs grant so
    // the role is scoped to exactly this group (least privilege).
    const logGroupName =
      obs.logs.logGroup ||
      `/aws/lambda-microvms/${getResourceName(serviceName, name, stage)}`

    // ── Compile image ────────────────────────────────────────────────────────
    const imageCtx = {
      ...ctx,
      baseImage,
      codeArtifactUri,
      buildRoleArn,
      execRoleArn,
      loggingDisabled,
      logGroupName,
      // BUILD always needs internet egress to pull FROM images etc.
      egressConnectors: [internetEgressArn(region)],
    }

    const imageLogicalId = getLogicalId(name, 'Image')
    const imageResource = compileImage(name, cfg, imageCtx)

    // Owned log group + monitoring resources (metric filters / alarms /
    // dashboard) exist only when logging is enabled — they read from the group.
    if (obs.logs.enabled) {
      template.Resources[logGroupLogicalId] = compileLogGroup(name, obs, obsCtx)
      // Image must not build before its (now CFN-owned) log group exists.
      imageResource.DependsOn = [
        ...(imageResource.DependsOn || []),
        logGroupLogicalId,
      ]
      Object.assign(
        template.Resources,
        compileMetricFilters(name, obs, obsCtx, logGroupLogicalId),
        compileAlarms(name, obs, obsCtx),
      )
      // Collect this sandbox's dashboard widgets; the single service dashboard
      // is assembled after the loop. (Returns [] when the dashboard is disabled.)
      dashboardSections.push({
        name,
        widgets: buildDashboardWidgets(name, obs, obsCtx),
      })
    }

    // ── Merge into template ──────────────────────────────────────────────────
    if (shouldGenerateRole(buildRoleCfg)) {
      template.Resources[buildRoleLogicalId] = generateBuildRole(
        name,
        { ...cfg, artifactBucket },
        { ...ctx, bucket: resolvedBucket, logGroupName },
      )
    }

    if (shouldGenerateRole(execRoleCfg)) {
      template.Resources[execRoleLogicalId] = generateExecutionRole(name, cfg, {
        ...ctx,
        bucket: resolvedBucket,
        loggingDisabled,
        logGroupName,
      })
    }

    if (cfg.vpc) {
      const operatorRoleResource = generateOperatorRole(name, ctx)
      template.Resources[operatorRoleLogicalId] = operatorRoleResource

      const connectorCtx = {
        ...ctx,
        operatorRoleArn: { 'Fn::GetAtt': [operatorRoleLogicalId, 'Arn'] },
      }
      const connectorResource = compileNetworkConnector(
        name,
        cfg.vpc,
        connectorCtx,
      )
      template.Resources[connectorLogicalId] = connectorResource

      // Expose connector ARN as Output for Phase-2 data-plane run path.
      template.Outputs[`${getLogicalId(name, 'Connector')}Arn`] = {
        Value: { Ref: connectorLogicalId },
      }
    }

    template.Resources[imageLogicalId] = imageResource

    // Image ARN output.
    template.Outputs[`${imageLogicalId}Arn`] = {
      Value: { Ref: imageLogicalId },
    }

    // Execution-role ARN output — invoke passes this to RunMicrovm.
    template.Outputs[`${imageLogicalId}ExecutionRoleArn`] = {
      Value: execRoleArn,
      Description: `Execution role ARN for the ${name} sandbox MicroVM`,
    }

    // ── Tags ───────────────────────────────────────────────────────────────────
    // Apply `cfg.tags` to every taggable resource this sandbox created (image,
    // log group, IAM roles, alarms, network connector) — not just the image.
    // MetricFilter is the only created type that does not support Tags. The
    // service dashboard is added after the loop (service-scoped, not tagged).
    const addedIds = Object.keys(template.Resources).filter(
      (id) => !resourceIdsBefore.has(id),
    )
    applySandboxTags(template.Resources, addedIds, cfg.tags)
  }

  // One dashboard per service, assembled from every sandbox's widget section.
  Object.assign(
    template.Resources,
    compileServiceDashboard(dashboardSections, { serviceName, stage, region }),
  )

  return pendingUploads
}
