import cliCommandsSchema from '../../cli/commands-schema.js'
import { log } from '@serverless/util'

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
    }

    return pluginCustom
  }

  async cliPrune() {
    if (this.options.dryRun) {
      this.logNotice('Dry-run enabled, no pruning actions will be performed.')
    }

    if (this.options.includeLayers) {
      await Promise.all([this.pruneFunctions(), this.pruneLayers()])
      return
    }

    if (this.options.layer && !this.options.function) {
      await this.pruneLayers()
    } else {
      await this.pruneFunctions()
    }
  }

  async postDeploy() {
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
        return
      }

      await this.pruneFunctions()
    }
  }

  async pruneLayers() {
    const selectedLayers = this.options.layer
      ? [this.options.layer]
      : this.serverless.service.getAllLayers()
    const layerNames = selectedLayers.map(
      (key) => this.serverless.service.getLayer(key).name || key,
    )

    this.createProgress('prune-plugin-prune-layers', 'Pruning layer versions')

    const layersData = []
    for (const layerName of layerNames) {
      const versions = await this.listVersionsForLayer(layerName)
      layersData.push({ name: layerName, versions })
    }

    for (const { name, versions } of layersData) {
      if (!versions.length) {
        continue
      }

      const deletionCandidates = this.selectPruneVersionsForLayer(versions)
      if (deletionCandidates.length > 0) {
        this.updateProgress(
          'prune-plugin-prune-layers',
          `Pruning layer versions (${name})`,
        )
      }

      if (this.options.dryRun) {
        this.printPruningCandidates(name, deletionCandidates)
      } else {
        await this.deleteVersionsForLayer(name, deletionCandidates)
      }
    }

    this.clearProgress('prune-plugin-prune-layers')
    this.logSuccess('Pruning of layers complete')
  }

  async pruneFunctions() {
    const selectedFunctions = this.options.function
      ? [this.options.function]
      : this.serverless.service.getAllFunctions()
    const functionNames = selectedFunctions.map(
      (key) => this.serverless.service.getFunction(key).name,
    )

    this.createProgress(
      'prune-plugin-prune-functions',
      'Pruning function versions',
    )

    const functionsData = []
    for (const functionName of functionNames) {
      const [versions, aliases] = await Promise.all([
        this.listVersionForFunction(functionName),
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

  selectPruneVersionsForLayer(versions) {
    return versions
      .map((f) => f.Version)
      .sort((a, b) =>
        parseInt(a) === parseInt(b) ? 0 : parseInt(a) > parseInt(b) ? -1 : 1,
      )
      .slice(this.getNumber())
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
