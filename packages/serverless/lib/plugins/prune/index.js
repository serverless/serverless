/**
 * Lambda version pruning support for Serverless Framework
 *
 * Originally derived from serverless-prune-plugin
 * (https://github.com/claygregory/serverless-prune-plugin)
 * Copyright (c) 2017 Clay Gregory and contributors
 * Licensed under the MIT License
 *
 * See THIRD_PARTY_LICENSES in the repository root for the full license text.
 */

import path from 'path'
import cliCommandsSchema from '../../cli/commands-schema.js'
import { log } from '@serverless/util'
import {
  buildPinnedShaSet,
  collectLayerArns,
  layerBasenameFromArn,
  sweepArtifacts,
} from './artifact-sweep.js'

class Prune {
  constructor(serverless, options, { log: pluginLog, progress } = {}) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.log = pluginLog || log
    this.progress = progress

    this.pluginCustom = this.loadCustom(this.serverless.service.custom)

    // Define schema for custom.prune configuration
    serverless.configSchemaHandler.defineCustomProperties({
      properties: {
        prune: {
          type: 'object',
          properties: {
            automatic: {
              type: 'boolean',
            },
            number: {
              type: 'integer',
              minimum: 0,
            },
            includeLayers: {
              type: 'boolean',
            },
            includeArtifacts: {
              type: 'boolean',
            },
          },
          additionalProperties: false,
        },
      },
    })

    this.commands = {
      prune: {
        ...cliCommandsSchema.get('prune'),
      },
    }

    this.hooks = {
      'prune:prune': this.cliPrune.bind(this),
      'after:deploy:deploy': this.postDeploy.bind(this),
    }

    // What THIS run deleted — or, under --dryRun, would have deleted —
    // keyed by function/layer name. Used by sweepDeploymentArtifacts() to
    // discount those versions so the sweep previews the post-prune world:
    // on a real run that's discounting versions Lambda's eventually-
    // consistent list APIs may still return moments after deletion; under
    // --dryRun (where nothing is actually deleted and nothing is recorded
    // by the delete methods) it's discounting the versions that WOULD be
    // gone, so `--dryRun --includeArtifacts` previews the sweep against
    // planned deletions instead of reporting every still-alive directory as
    // pinned. Reset at the start of every cliPrune()/postDeploy() run so
    // dryRun and repeated runs never leak state across runs (see
    // resetPrunedVersionTracking()).
    this.resetPrunedVersionTracking()
  }

  resetPrunedVersionTracking() {
    this.prunedFunctionVersions = new Map()
    this.prunedLayerVersions = new Map()
    // Per-run memo backing getFunctionVersionLists(). Reset here (same
    // place as the pruned-version maps above) so dryRun and repeated
    // cliPrune()/postDeploy() runs never reuse a stale listVersionsByFunction
    // fetch from a previous run.
    this._functionVersionListsPromise = null
  }

  // Lazily fetches, and memoizes for the lifetime of this run, the version
  // listing for every function in the service. pruneFunctions() (when not
  // scoped to a single --function) and pruneLayers()'s attached-layer-set
  // builder both need this same "every function's versions" listing, and
  // cliPrune()/postDeploy() run pruneFunctions() and pruneLayers()
  // concurrently via Promise.all under --includeLayers — without sharing
  // this fetch, a combined run would call listVersionsByFunction twice per
  // function. The cache is reset at the start of every
  // cliPrune()/postDeploy() run, see resetPrunedVersionTracking().
  //
  // CRITICAL: sweepDeploymentArtifacts() must NOT use this cache. It
  // intentionally re-lists functions fresh, after deletions, because it
  // needs the post-prune view — see the comment at the top of that method.
  getFunctionVersionLists() {
    if (!this._functionVersionListsPromise) {
      const functionNames = this.serverless.service
        .getAllFunctions()
        .map((key) => this.serverless.service.getFunction(key).name)
      this._functionVersionListsPromise = Promise.all(
        functionNames.map((name) => this.listVersionForFunction(name)),
      ).then((versionLists) => ({ functionNames, versionLists }))
    }
    return this._functionVersionListsPromise
  }

  getNumber() {
    return this.options.number || this.pluginCustom.number
  }

  loadCustom(custom) {
    const pluginCustom = {}
    if (custom && custom.prune) {
      if (custom.prune.number != null) {
        const number = parseInt(custom.prune.number)
        if (!isNaN(number)) pluginCustom.number = number
      }

      if (typeof custom.prune.automatic === 'boolean') {
        pluginCustom.automatic = custom.prune.automatic
      }

      if (typeof custom.prune.includeLayers === 'boolean') {
        pluginCustom.includeLayers = custom.prune.includeLayers
      }

      if (typeof custom.prune.includeArtifacts === 'boolean') {
        pluginCustom.includeArtifacts = custom.prune.includeArtifacts
      }
    }

    return pluginCustom
  }

  async cliPrune() {
    this.resetPrunedVersionTracking()

    if (this.options.dryRun) {
      this.logNotice('Dry-run enabled, no pruning actions will be performed.')
    }

    if (this.options.includeLayers) {
      await Promise.all([this.pruneFunctions(), this.pruneLayers()])
    } else if (this.options.layer && !this.options.function) {
      await this.pruneLayers()
    } else {
      await this.pruneFunctions()
    }

    if (this.shouldSweepArtifacts()) {
      await this.sweepDeploymentArtifacts()
    }
  }

  async postDeploy() {
    this.resetPrunedVersionTracking()
    this.pluginCustom = this.loadCustom(this.serverless.service.custom)

    if (this.options.noDeploy === true) {
      return
    }

    if (
      this.pluginCustom.automatic &&
      this.pluginCustom.number !== undefined &&
      this.pluginCustom.number >= 0
    ) {
      if (this.pluginCustom.includeLayers) {
        await Promise.all([this.pruneFunctions(), this.pruneLayers()])
      } else {
        await this.pruneFunctions()
      }

      if (this.shouldSweepArtifacts()) {
        await this.sweepDeploymentArtifacts()
      }
    }
  }

  shouldSweepArtifacts() {
    const requested =
      this.options.includeArtifacts || this.pluginCustom.includeArtifacts
    if (!requested) return false
    if (this.options.function || this.options.layer) {
      this.logNotice(
        'Skipping deployment artifact sweep: it is not available on function/layer-scoped prune runs.',
      )
      return false
    }
    return true
  }

  async sweepDeploymentArtifacts() {
    this.createProgress(
      'prune-plugin-sweep-artifacts',
      'Sweeping deployment artifacts',
    )

    // Surviving function versions (post-prune) — fresh lists. Lambda's list
    // APIs are eventually consistent, so a version this same run just
    // deleted can still show up here moments later; discount those using
    // the ground-truth record from deleteVersionsForFunction() rather than
    // trusting the fresh listing alone.
    //
    // Deliberately NOT using the getFunctionVersionLists() memo here: that
    // cache may hold a pre-prune snapshot (populated by pruneFunctions()
    // earlier in this same run), while this sweep needs a fresh, post-prune
    // listing to correctly discount just-deleted versions above.
    const functionNames = this.serverless.service
      .getAllFunctions()
      .map((key) => this.serverless.service.getFunction(key).name)
    const rawFunctionVersionLists = await Promise.all(
      functionNames.map((name) => this.listVersionForFunction(name)),
    )
    const functionVersionLists = rawFunctionVersionLists.map((versions, i) =>
      this.excludePrunedVersions(
        versions,
        this.prunedFunctionVersions.get(functionNames[i]),
      ),
    )

    // Surviving layer versions (post-prune) — fresh lists. Same eventual
    // consistency caveat as above applies to listLayerVersions.
    const layerNames = this.serverless.service
      .getAllLayers()
      .map((key) => this.serverless.service.getLayer(key).name || key)
    const rawLayerVersionLists = await Promise.all(
      layerNames.map((name) => this.listVersionsForLayer(name)),
    )
    const layerVersionLists = rawLayerVersionLists.map((versions, i) =>
      this.excludePrunedVersions(
        versions,
        this.prunedLayerVersions.get(layerNames[i]),
      ),
    )

    const pinnedShas = buildPinnedShaSet(functionVersionLists)
    const layerArns = collectLayerArns(functionVersionLists, layerVersionLists)

    // Lazily built (only if a deleted-but-attached ARN is actually
    // encountered below), memoized map from published Lambda layer name ->
    // deployment artifact basename, built from this service's layer config.
    // Needed because deployment artifacts are named after the CONFIG KEY
    // (see provider.resolveLayerArtifactName / naming.getLayerArtifactName),
    // not the published layer name — the two only coincide when
    // `layers.<key>` has no `name:` override. The basename fail-safe
    // fallback below (an attached ARN whose getLayerVersion call throws,
    // e.g. deleted-but-still-attached) previously only ever pinned
    // `<ARN-name>.zip`, which protects nothing when a custom `name:` was
    // configured. Unknown/unconfigured layer names are simply absent from
    // this map and fall through to the old ARN-name-only behavior.
    let layerArtifactBasenameByPublishedName
    const getLayerArtifactBasenameByPublishedName = () => {
      if (!layerArtifactBasenameByPublishedName) {
        layerArtifactBasenameByPublishedName = new Map()
        for (const key of this.serverless.service.getAllLayers()) {
          const layerObject = this.serverless.service.getLayer(key)
          const publishedName = layerObject.name || key
          const basename = path.basename(
            this.provider.resolveLayerArtifactName(key),
          )
          layerArtifactBasenameByPublishedName.set(publishedName, basename)
        }
      }
      return layerArtifactBasenameByPublishedName
    }

    // Resolve each surviving/attached layer version to an exact artifact pin;
    // unresolvable (deleted-but-attached) versions fall back to basename pins.
    const layerPins = new Map()
    const layerBasenameFailSafePins = new Set()
    for (const arn of layerArns) {
      const parts = arn.split(':')
      try {
        // Content.ResolvedS3Object (used for the exact-pin path below) is
        // unknown to the frozen v2 `aws-sdk` Lambda API model, which
        // silently drops it and would degrade this to the less precise sha
        // fallback. Use the v3 SDK path so the exact pin is available.
        const layerVersion = await this.provider.request(
          'Lambda',
          'getLayerVersion',
          { LayerName: parts[6], VersionNumber: Number(parts[7]) },
          { sdkVersion: 3 },
        )
        const resolved = layerVersion.Content?.ResolvedS3Object
        if (resolved?.S3Key) {
          layerPins.set(resolved.S3Key, resolved.S3ObjectVersion ?? null)
        } else if (layerVersion.Content?.CodeSha256) {
          pinnedShas.add(layerVersion.Content.CodeSha256)
        } else {
          layerBasenameFailSafePins.add(layerBasenameFromArn(arn))
        }
      } catch {
        // Raw ARN-name-derived basename — kept as a belt-and-braces pin
        // even when the config-key mapping below also applies. Over-pinning
        // an artifact that isn't actually there is harmless.
        layerBasenameFailSafePins.add(layerBasenameFromArn(arn))
        const layerNameFromArn = parts[6]
        const mappedBasename =
          getLayerArtifactBasenameByPublishedName().get(layerNameFromArn)
        if (mappedBasename) {
          layerBasenameFailSafePins.add(mappedBasename)
        }
      }
    }

    const bucketName = await this.provider.getServerlessDeploymentBucketName()
    const keepCount =
      this.serverless.service.provider.deploymentBucketObject
        ?.maxPreviousDeploymentArtifacts ?? 5

    const { markedDirs, keptDirs } = await sweepArtifacts({
      provider: this.provider,
      bucketName,
      deploymentPrefix: this.provider.getDeploymentPrefix(),
      service: this.serverless.service.service,
      stage: this.provider.getStage(),
      keepCount,
      pinnedShas,
      layerPins,
      layerBasenameFailSafePins,
      dryRun: Boolean(this.options.dryRun),
    })

    for (const { dir, reasons } of keptDirs) {
      this.logInfo(`Keeping deployment ${dir}: ${reasons.join('; ')}`)
    }
    for (const dir of markedDirs) {
      this.logInfo(
        this.options.dryRun
          ? `Deployment ${dir} selected for deletion (dry-run).`
          : `Marked deployment ${dir} for deletion.`,
      )
    }

    this.clearProgress('prune-plugin-sweep-artifacts')
    this.logSuccess('Deployment artifact sweep complete')
  }

  async pruneLayers() {
    const selectedLayers = this.options.layer
      ? [this.options.layer]
      : this.serverless.service.getAllLayers()
    const layerNames = selectedLayers.map(
      (key) => this.serverless.service.getLayer(key).name || key,
    )

    this.createProgress('prune-plugin-prune-layers', 'Pruning layer versions')

    // Build the set of layer version ARNs currently attached to any
    // existing version of THIS service's functions (always computed from
    // ALL service functions, never scoped down to a --layer selection,
    // since any function can reference any layer). A layer version in this
    // set must never be deleted, even if it falls outside the retention
    // window.
    //
    // Deliberate superset semantics: cliPrune() runs pruneFunctions() and
    // pruneLayers() concurrently via Promise.all, so ordering between the
    // two is undefined. A function version that pruneFunctions() is
    // deleting in parallel may still show up here as "attached" — that's
    // fine. Over-protecting a layer version for one prune cycle is safe;
    // the next prune run converges once the function version is actually
    // gone.
    //
    // Skip this fetch entirely when there is nothing selected to prune —
    // building the attached set would otherwise cost one
    // listVersionsByFunction call per service function for zero benefit.
    let attachedLayerArns = new Set()
    if (layerNames.length > 0) {
      const { versionLists: attachedFunctionVersionLists } =
        await this.getFunctionVersionLists()
      for (const versions of attachedFunctionVersionLists) {
        for (const version of versions) {
          for (const layer of version.Layers || []) {
            if (layer.Arn) attachedLayerArns.add(layer.Arn)
          }
        }
      }
    }

    const layersData = []
    for (const layerName of layerNames) {
      const versions = await this.listVersionsForLayer(layerName)
      layersData.push({ name: layerName, versions })
    }

    for (const { name, versions } of layersData) {
      if (!versions.length) {
        continue
      }

      const deletionCandidates = this.selectPruneVersionsForLayer(
        versions,
        attachedLayerArns,
        name,
      )
      if (deletionCandidates.length > 0) {
        this.updateProgress(
          'prune-plugin-prune-layers',
          `Pruning layer versions (${name})`,
        )
      }

      if (this.options.dryRun) {
        this.printPruningCandidates(name, deletionCandidates)
        // Record the planned deletions so a chained --includeArtifacts
        // sweep previews the post-prune world instead of finding every
        // still-alive version and reporting the directory as pinned — see
        // the comment on this.prunedLayerVersions in the constructor.
        this.recordPlannedPruneVersions(
          this.prunedLayerVersions,
          name,
          deletionCandidates,
        )
      } else {
        await this.deleteVersionsForLayer(name, deletionCandidates)
      }
    }

    this.clearProgress('prune-plugin-prune-layers')
    this.logSuccess('Pruning of layers complete')
  }

  async pruneFunctions() {
    const scopedToOneFunction = Boolean(this.options.function)
    const selectedFunctions = scopedToOneFunction
      ? [this.options.function]
      : this.serverless.service.getAllFunctions()
    const functionNames = selectedFunctions.map(
      (key) => this.serverless.service.getFunction(key).name,
    )

    this.createProgress(
      'prune-plugin-prune-functions',
      'Pruning function versions',
    )

    // Unscoped runs (the common case, and the only case that can run
    // concurrently alongside pruneLayers()'s attached-set builder under
    // --includeLayers) share the memoized listVersionsByFunction fetch via
    // getFunctionVersionLists(), so a combined run makes exactly one pass
    // over the service's functions instead of two. A --function-scoped run
    // bypasses the memo: it only needs that one function's versions, and
    // the memo always covers every service function.
    let versionsByFunctionName
    if (!scopedToOneFunction) {
      const { functionNames: allFunctionNames, versionLists } =
        await this.getFunctionVersionLists()
      versionsByFunctionName = new Map(
        allFunctionNames.map((name, i) => [name, versionLists[i]]),
      )
    }

    const functionsData = []
    for (const functionName of functionNames) {
      const [versions, aliases] = await Promise.all([
        versionsByFunctionName
          ? Promise.resolve(versionsByFunctionName.get(functionName))
          : this.listVersionForFunction(functionName),
        this.listAliasesForFunction(functionName),
      ])
      functionsData.push({ name: functionName, versions, aliases })
    }

    for (const { name, versions, aliases } of functionsData) {
      if (!versions.length) {
        continue
      }

      const deletionCandidates = this.selectPruneVersionsForFunction(
        versions,
        aliases,
      )
      if (deletionCandidates.length > 0) {
        this.updateProgress(
          'prune-plugin-prune-functions',
          `Pruning function versions (${name})`,
        )
      }

      if (this.options.dryRun) {
        this.printPruningCandidates(name, deletionCandidates)
        // Record the planned deletions so a chained --includeArtifacts
        // sweep previews the post-prune world instead of finding every
        // still-alive version and reporting the directory as pinned — see
        // the comment on this.prunedFunctionVersions in the constructor.
        this.recordPlannedPruneVersions(
          this.prunedFunctionVersions,
          name,
          deletionCandidates,
        )
      } else {
        await this.deleteVersionsForFunction(name, deletionCandidates)
      }
    }

    this.clearProgress('prune-plugin-prune-functions')
    this.logSuccess('Pruning of functions complete')
  }

  async deleteVersionsForLayer(layerName, versions) {
    for (const version of versions) {
      this.logInfo(`Deleting layer version ${layerName}:${version}.`)

      const params = {
        LayerName: layerName,
        VersionNumber: version,
      }

      await this.provider.request('Lambda', 'deleteLayerVersion', params)
      this.recordPrunedVersion(this.prunedLayerVersions, layerName, version)
    }
  }

  async deleteVersionsForFunction(functionName, versions) {
    for (const version of versions) {
      this.logInfo(`Deleting function version ${functionName}:${version}.`)

      const params = {
        FunctionName: functionName,
        Qualifier: version,
      }

      try {
        await this.provider.request('Lambda', 'deleteFunction', params)
        this.recordPrunedVersion(
          this.prunedFunctionVersions,
          functionName,
          version,
        )
      } catch (e) {
        // Ignore if trying to delete replicated lambda edge function
        if (
          e.providerError &&
          e.providerError.statusCode === 400 &&
          e.providerError.message.startsWith('Lambda was unable to delete') &&
          e.providerError.message.indexOf(
            'because it is a replicated function.',
          ) > -1
        ) {
          this.logWarning(
            `Unable to delete replicated Lambda@Edge function version ${functionName}:${version}.`,
          )
        } else {
          throw e
        }
      }
    }
  }

  // Records a qualifier/version so sweepDeploymentArtifacts() can discount
  // it from the "still alive" listing. On a real run this is called only
  // after a delete call has NOT thrown (ground truth for what was actually
  // deleted, discounting Lambda's eventually-consistent list APIs). Under
  // --dryRun it is called instead by recordPlannedPruneVersions() with the
  // versions that WOULD be deleted, so the map always reflects "gone in the
  // post-prune world", real or planned.
  recordPrunedVersion(map, name, version) {
    if (!map.has(name)) {
      map.set(name, new Set())
    }
    map.get(name).add(String(version))
  }

  // dryRun counterpart to deleteVersionsForFunction()/deleteVersionsForLayer():
  // records planned-but-not-executed deletions into the same map/shape those
  // methods use, so sweepDeploymentArtifacts()'s excludePrunedVersions() sees
  // an identical post-prune view whether this was a real or a dry run.
  recordPlannedPruneVersions(map, name, versions) {
    for (const version of versions) {
      this.recordPrunedVersion(map, name, version)
    }
  }

  // Filters a fresh version listing down to versions this run did not just
  // delete. `prunedSet` is undefined when nothing was pruned for this
  // name (e.g. dryRun, or a function/layer scoped run that never touched
  // it) — in that case the listing passes through unchanged.
  excludePrunedVersions(versions, prunedSet) {
    if (!prunedSet || prunedSet.size === 0) return versions
    return versions.filter((v) => !prunedSet.has(String(v.Version)))
  }

  async listAliasesForFunction(functionName) {
    const params = {
      FunctionName: functionName,
    }

    try {
      return await this.makeLambdaRequest(
        'listAliases',
        params,
        (r) => r.Aliases,
      )
    } catch (e) {
      // Ignore if function not deployed
      if (e.providerError && e.providerError.statusCode === 404) return []
      throw e
    }
  }

  async listVersionForFunction(functionName) {
    const params = {
      FunctionName: functionName,
    }

    try {
      return await this.makeLambdaRequest(
        'listVersionsByFunction',
        params,
        (r) => r.Versions,
      )
    } catch (e) {
      // Ignore if function not deployed
      if (e.providerError && e.providerError.statusCode === 404) return []
      throw e
    }
  }

  async listVersionsForLayer(layerName) {
    const params = {
      LayerName: layerName,
    }

    try {
      return await this.makeLambdaRequest(
        'listLayerVersions',
        params,
        (r) => r.LayerVersions,
      )
    } catch (e) {
      // Ignore if layer not deployed
      if (e.providerError && e.providerError.statusCode === 404) return []
      throw e
    }
  }

  async makeLambdaRequest(action, params, responseMapping) {
    const results = []

    let response = await this.provider.request('Lambda', action, params)
    results.push(...responseMapping(response))

    while (response.NextMarker) {
      response = await this.provider.request('Lambda', action, {
        ...params,
        Marker: response.NextMarker,
      })
      results.push(...responseMapping(response))
    }

    return results
  }

  selectPruneVersionsForFunction(versions, aliases) {
    const aliasedVersion = aliases.map((a) => a.FunctionVersion)

    return versions
      .map((f) => f.Version)
      .filter((v) => v !== '$LATEST') // skip $LATEST
      .filter((v) => aliasedVersion.indexOf(v) === -1) // skip aliased versions
      .sort((a, b) =>
        parseInt(a) === parseInt(b) ? 0 : parseInt(a) > parseInt(b) ? -1 : 1,
      )
      .slice(this.getNumber())
  }

  selectPruneVersionsForLayer(versions, attachedLayerArns = new Set(), name) {
    const beyondKeepWindow = versions
      .slice()
      .sort((a, b) =>
        parseInt(a.Version) === parseInt(b.Version)
          ? 0
          : parseInt(a.Version) > parseInt(b.Version)
            ? -1
            : 1,
      )
      .slice(this.getNumber())

    const deletionCandidates = []
    for (const version of beyondKeepWindow) {
      if (
        version.LayerVersionArn &&
        attachedLayerArns.has(version.LayerVersionArn)
      ) {
        // Never delete a layer version still attached to an existing
        // version of one of this service's functions — see the superset
        // comment in pruneLayers() for why an over-inclusive attached set
        // is safe here.
        this.logInfo(
          `Retaining layer version ${name}:${version.Version} — attached to existing function versions.`,
        )
        continue
      }
      deletionCandidates.push(version.Version)
    }
    return deletionCandidates
  }

  printPruningCandidates(name, deletionCandidates) {
    deletionCandidates.forEach((version) =>
      this.logInfo(`${name}:${version} selected for deletion.`),
    )
  }

  // -- Logging utilities ---

  logInfo(message) {
    if (this.log.info) this.log.info(message)
    else if (this.log) this.log(`Prune: ${message}`)
  }

  logNotice(message) {
    if (this.log.notice) this.log.notice(message)
    else if (this.log) this.log(`Prune: ${message}`)
  }

  logWarning(message) {
    if (this.log.warning) this.log.warning(message)
    else if (this.log) this.log(`Prune: ${message}`)
  }

  logSuccess(message) {
    if (this.log.success) this.log.success(message)
    else if (this.log) this.log(`Prune: ${message}`)
  }

  createProgress(name, message) {
    if (!this.progress) {
      this.logInfo(`${message}...`)
    } else {
      this.progress.create({
        message,
        name,
      })
    }
  }

  updateProgress(name, message) {
    if (!this.progress) {
      this.logInfo(message)
    } else {
      this.progress.get(name).update(message)
    }
  }

  clearProgress(name) {
    if (this.progress) {
      this.progress.get(name).remove()
    }
  }
}

export default Prune
