import {
  addPlaceholderToGraph,
  collectFromObject,
  extractPlaceholderDetailsFromPlaceholderString,
  extractPlaceholderFromObject,
  throwIfCyclesFound,
} from './placeholders.js'
import {
  addResolversForProvider,
  createResolverProvider,
  getProviderNamesFromConfigFile,
} from './providers.js'
import graphlib from '@dagrejs/graphlib'
import _ from 'lodash'
import { processGraphInParallel } from './graph.js'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  getStateResolverName,
} from '@serverless/util'
import { providerRegistry } from './registry/index.js'
import { printResult } from './index.js'

const { Graph } = graphlib

export const DEFAULT_AWS_CREDENTIAL_RESOLVER = 'default-aws-credential-resolver'
const STATE_RESOLVER = 'default-state-resolver'

/**
 * Whether a registry provider type is compose-only (the `service` provider and
 * anything else marked `composeOnly`). Unknown types are not compose-only.
 *
 * @param {string} [type] - A registry provider type name.
 * @returns {boolean}
 */
const isComposeOnlyType = (type) =>
  Boolean(type && providerRegistry.get(type)?.composeOnly)

/**
 * Whether a placeholder-graph node label is a placeholder (a value position in
 * the configuration) rather than a provider or dedicated-resolver node, which
 * are dependencies OF a placeholder and hold no config value themselves.
 *
 * @param {Object} [nodeLabel] - A node label from the placeholders graph.
 * @returns {boolean}
 */
const isPlaceholderNode = (nodeLabel) =>
  Boolean(nodeLabel) &&
  !nodeLabel.provider &&
  !nodeLabel.dedicatedResolverConfig &&
  Array.isArray(nodeLabel.path)

/**
 * Whether a placeholder resolves through one of `wantedProviders` — as its own
 * provider or as any of its fallbacks (`${opt:x, service:db.Host}` counts).
 *
 * @param {Object} nodeLabel - A placeholder node label.
 * @param {Set<string>} wantedProviders - Provider names to match.
 * @returns {boolean}
 */
const placeholderUsesProvider = (nodeLabel, wantedProviders) =>
  Boolean(
    nodeLabel.fallbacks?.some((fallback) =>
      wantedProviders.has(fallback?.providerName),
    ),
  )

/**
 * Whether a resolution failure means "this source has no value for you" — in
 * which case a variable's next declared fallback should be tried — rather than
 * "something is wrong", which must surface immediately.
 *
 * Providers normally report an absent value by returning null. A provider that
 * has something to teach about the absence (what is missing, how to create it)
 * throws `RESOLVER_VALUE_NOT_FOUND` with that text instead, and the fallback
 * loop treats the two alike; when no fallback remains the error is rethrown
 * unchanged, so the text is what the user sees. Anything else (a bad key
 * shape, a credentials or network failure, an unknown resolver) still fails
 * the run on the spot, fallbacks or not.
 *
 * @param {unknown} error - The error a resolver threw.
 * @returns {boolean}
 */
const isRecoverableResolutionError = (error) =>
  error instanceof ServerlessError &&
  error.code === ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND

/**
 * The ResolverManager class is responsible for managing the resolvers for each provider.
 * It loads placeholders, resolvers, and dashboard data, and resolves and replaces placeholders in the service configuration file.
 */
export class ResolverManager {
  static limitedProvidersSet = [
    'env',
    'opt',
    'file',
    'sls',
    'strToBool',
    'git',
    'self',
    'param',
  ]

  processingState = {}

  // Provider names the up-front `resolveConfigFile` pass selected. A later
  // path-scoped pass (`resolveUnderPath`) re-selects them alongside the
  // providers it enables, so a token that ENCLOSES a deferred reference — e.g.
  // `${opt:${service:db.OptionName}}` — resolves fully once its inner
  // reference does, instead of being left as a half-resolved literal.
  #upFrontSelectedProviders = []

  /**
   * Create a new ResolverManager.
   *
   * @param {Logger} logger - The logger.
   * @param {Object} serviceConfigFile - The service configuration file.
   * @param {string} configFileDirPath - The directory path of the configuration file.
   * @param {Object} options - The options.
   * The AWS region defined in Framework (options or provider.region) or the default region.
   * @param {ResolverProvider[]} composeResolverProviders - The Compose resolver providers.
   * @param {Object} composeParams - The Compose parameters.
   * @param {DashboardData} dashboard - The dashboard data.
   * @param {boolean} print - Whether to print the replacements.
   * @param versionFramework - The version of the framework.
   * @param {Object} [scope] - Manager scope flags.
   * @param {boolean} [scope.isComposeConfigFile] - Whether this manager resolves
   * a compose file. Compose-only provider types are available only when true.
   */
  constructor(
    logger,
    serviceConfigFile,
    configFileDirPath,
    options,
    composeResolverProviders,
    composeParams,
    dashboard,
    print,
    versionFramework,
    { isComposeConfigFile = false } = {},
  ) {
    this.print = print
    this.isComposeConfigFile = isComposeConfigFile
    if (!this.print) {
      logger.debug = () => {}
    }
    this.logger = logger
    this.serviceConfigFile = serviceConfigFile
    this.configFileDirPath = configFileDirPath
    this.options = options
    this.stage = options?.stage || options?.s
    this.composeParams = composeParams
    this.resolverProviders = { ...(composeResolverProviders || {}) }
    this.composeResolverProviders = { ...(composeResolverProviders || {}) }
    this.dashboard = dashboard
    this._replacements = []
    this.providersUsed = new Set()
    this.placeholdersGraph = new Graph()
    this.versionFramework = versionFramework
  }

  addResolverProvider(name, resolver) {
    this.resolverProviders[name] = resolver
  }

  getResolverProviders() {
    // Compose-only providers must never be inherited by child managers, so
    // strip them from the set handed to callers (child dispatch, state store).
    return Object.fromEntries(
      Object.entries(this.resolverProviders).filter(
        ([, provider]) => !provider?.instance?.constructor?.composeOnly,
      ),
    )
  }

  /**
   * Single point of truth for the compose-only scope rule: a `composeOnly`
   * provider type is only available inside a compose-file manager. Takes a
   * resolved provider class (each call site resolves it from a registry type
   * name or a config-declared instance's `type`).
   */
  #isProviderAvailableHere(Provider) {
    return !Provider?.composeOnly || this.isComposeConfigFile
  }

  /**
   * Effective resolver instance declarations for this run: for every instance
   * name declared in `stages.<this.stage>.resolvers` or
   * `stages.default.resolvers`, the WHOLE resolver block from the FIRST stage in
   * `[this.stage, 'default']` that declares it — the exact block selection
   * `loadProvider` performs. Fields are never merged across blocks: an
   * active-stage redeclaration fully shadows the `default` one.
   *
   * The single lookup behind every resolver-block question: the service-typed
   * classification ones — is an instance service-typed, which stage does it
   * pin, does it shadow a built-in type name — plus availability gating
   * (`#configuredResolverProviderClass`) and provider construction
   * (`#addResolverProvider`). So those answers cannot drift from each other or
   * from how the resolver is actually loaded.
   * Blocks for other stages are deliberately ignored: they cannot apply
   * to this run, and `pruneUnusedStages` removes them anyway — except `default`,
   * which always survives and is therefore always considered here.
   *
   * @returns {Map<string, Object>} instance name -> its effective resolver block
   */
  #effectiveResolverConfigs() {
    const configs = new Map()
    for (const stageName of [this.stage, 'default']) {
      const resolvers = this.serviceConfigFile?.stages?.[stageName]?.resolvers
      if (!resolvers || typeof resolvers !== 'object') {
        continue
      }
      for (const [name, resolverConfig] of Object.entries(resolvers)) {
        if (!configs.has(name)) {
          configs.set(name, resolverConfig)
        }
      }
    }
    return configs
  }

  /**
   * The provider class backing a config-declared resolver instance, resolved
   * via the instance's declared `type` (not its name — an instance may be named
   * after an unrelated registry type). Returns undefined if the type is unknown.
   */
  #configuredResolverProviderClass(resolverName) {
    const type = this.#effectiveResolverConfigs().get(resolverName)?.type
    return type ? providerRegistry.get(type) : undefined
  }

  async loadDashboardData(authenticatedData) {
    if (!this.dashboard && authenticatedData) {
      this.dashboard = {
        aws:
          authenticatedData?.dashboard?.serviceProvider &&
          authenticatedData.dashboard.serviceProvider,
        params:
          authenticatedData?.dashboard?.instanceParameters &&
          authenticatedData.dashboard.instanceParameters,
        accessKey:
          authenticatedData?.accessKeyV1 || authenticatedData?.accessKeyV2,
      }
      if (!this.dashboard?.aws && !this.dashboard?.params) {
        this.dashboard = null
      }
      // If the dashboard data is available, store the AWS credentials
      // in the AWS credential resolver and reload its credentials
      const credentialResolverInstance =
        this.resolverProviders?.[this.credentialResolverName]?.instance
      if (this.dashboard && credentialResolverInstance) {
        credentialResolverInstance.dashboard = this.dashboard
        credentialResolverInstance._credentialsPromise =
          credentialResolverInstance.resolveCredentials()
        credentialResolverInstance.credentials =
          await credentialResolverInstance._credentialsPromise
        credentialResolverInstance._credentialsPromise = null
      }
    }
  }

  getReplacements() {
    return this._replacements
  }

  getDashboard() {
    return this.dashboard
  }

  // Resolve org, app, service, provider.region, and provider.profile keys
  // This is required to authenticate with the Serverless Dashboard
  async resolveOrgAppServiceRegion() {
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders: ResolverManager.limitedProvidersSet,
      selectedPaths: [['org'], ['app'], ['service'], ['provider', 'region']],
    })
  }

  async resolveParams(selectedProviders) {
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders,
      selectedPaths: [
        ['params'],
        ['params', 'default'],
        ['params', this.stage],
        ['stages', 'default', 'params'],
        ['stages', this.stage, 'params'],
      ],
    })
  }

  // Resolve provider.profile key with limited providers set
  // and additionally param provider
  async resolveProviderProfile() {
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders: ResolverManager.limitedProvidersSet,
      selectedPaths: [['provider', 'profile']],
    })
  }

  async resolveLicenseKey() {
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedPaths: [['licenseKey']],
    })
  }

  /**
   * Determines the credential resolver for the current configuration.
   *
   * This function resolves AWS deployment credentials using the following steps:
   *
   * 1. If `provider.resolver` is set, it uses the specified resolver to obtain the credentials.
   * 2. If only one AWS provider is specified in the configuration, it directly resolves
   *    the credentials for that provider.
   * 3. If multiple AWS providers are specified but no `provider.resolver` is defined,
   *    an error is thrown to indicate ambiguity.
   * 4. If no AWS provider is specified in the configuration, it falls back to the
   *    default AWS credential provider chain to resolve the credentials.
   */
  setCredentialResolver() {
    if (
      this.serviceConfigFile?.provider?.profile &&
      this.serviceConfigFile?.provider?.resolver
    ) {
      throw new Error(
        'The provider.profile and provider.resolver cannot be set at the same time',
      )
    }
    let credentialResolverName
    // If the provider.resolver is set, use it
    if (this.serviceConfigFile?.provider?.resolver) {
      credentialResolverName = this.serviceConfigFile?.provider?.resolver
    } else if (
      !this.serviceConfigFile?.provider?.profile &&
      !this.serviceConfigFile?.provider?.resolver
    ) {
      const awsProviders = [
        ...this.getAwsProviders('default'),
        ...this.getAwsProviders(this.stage),
      ]

      // If there are multiple resolvers with type "aws" and none of them is
      // provided in the provider.resolver key, throw an error
      if (awsProviders.length > 1) {
        throw new Error(
          'Multiple resolvers with type "aws" found. Please specify the credential provider to use for deployment in the provider.resolver key.',
        )
      }

      // If there is only one resolver with type "aws", use it
      if (awsProviders.length === 1) {
        credentialResolverName = awsProviders[0].name
      }
    }
    if (!credentialResolverName) {
      credentialResolverName = DEFAULT_AWS_CREDENTIAL_RESOLVER
    }
    this.credentialResolverName = credentialResolverName
  }

  addDefaultAwsCredentialResolver() {
    // If the default AWS credential resolver is used, add it to the resolver providers
    if (this.credentialResolverName === DEFAULT_AWS_CREDENTIAL_RESOLVER) {
      this.addResolverProvider(
        DEFAULT_AWS_CREDENTIAL_RESOLVER,
        createResolverProvider(
          {
            type: 'aws',
            profile:
              this.options?.['aws-profile'] ||
              this.serviceConfigFile?.provider?.profile,
          },
          this.serviceConfigFile,
          this.configFileDirPath,
          this.options,
          this.stage,
          this.dashboard,
          this.composeParams,
          this.resolveVariable.bind(this),
          this.resolveConfigurationProperty.bind(this),
          log.get(`core:resolver:${DEFAULT_AWS_CREDENTIAL_RESOLVER}`),
          this.versionFramework,
        ),
      )
    }
  }

  async loadCustomStateResolver() {
    const stateResolver = getStateResolverName({
      service: this.serviceConfigFile,
    })
    if (stateResolver) {
      const { providerName } = this.loadResolver({
        resolverName: stateResolver,
      })
      await this.loadAndResolveProvider({ providerName })
    }
  }

  async loadAndResolveProvider({ providerName }) {
    const { stageName } = this.loadProvider({ providerName })
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedPaths: [['stages', stageName, 'resolvers', providerName]],
    })
    return this.getProvider(providerName)
  }

  loadProvider({ providerName }) {
    const stagesToProcess = [this.stage, 'default']
    for (const stageName of stagesToProcess) {
      const stage = this.serviceConfigFile?.stages?.[stageName]
      if (stage && stage.resolvers) {
        if (providerName in stage.resolvers) {
          this.placeholdersGraph.setNode(providerName, { provider: true })
          return { stage: stageName }
        }
      }
    }
    throw new Error(`Provider ${providerName} not found`)
  }

  addStateResolver({ bucketName, bucketRegion }) {
    const resolverConfig = {
      type: 's3',
      bucketName,
      region: bucketRegion,
    }
    addResolversForProvider(
      { [STATE_RESOLVER]: resolverConfig },
      this.resolverProviders[this.credentialResolverName].instance,
      this.resolverProviders[this.credentialResolverName].resolvers,
      this.resolverProviders[this.credentialResolverName].writers,
    )
    return {
      provider: this.resolverProviders[this.credentialResolverName],
      resolverConfig,
    }
  }

  addCredentialResolverToGraph() {
    if (
      this.credentialResolverName !== DEFAULT_AWS_CREDENTIAL_RESOLVER &&
      !this.placeholdersGraph.hasNode(this.credentialResolverName)
    ) {
      this.placeholdersGraph.setNode(this.credentialResolverName, {
        provider: true,
      })
    }
  }

  pruneUnusedStages() {
    const stages = this.serviceConfigFile && this.serviceConfigFile.stages
    if (!stages || typeof stages !== 'object') return
    if (!this.stage) return
    Object.keys(stages).forEach((stageName) => {
      if (stageName !== 'default' && stageName !== this.stage) {
        delete stages[stageName]
      }
    })
  }

  getAwsProviders(stage) {
    if (!this.serviceConfigFile?.stages?.[stage]?.resolvers) {
      return []
    }
    return Object.entries(this.serviceConfigFile?.stages?.[stage].resolvers)
      .filter(([, provider]) => provider.type === 'aws')
      .map(([name, provider]) => ({
        name,
        provider,
      }))
  }

  /**
   * Config-declared resolver instance names whose EFFECTIVE `type` is a
   * compose-only (service) provider type. Effective means the block selected by
   * `#effectiveResolverConfigs` — the same `[stage, 'default']` precedence
   * `loadProvider` applies — so an instance the active stage redeclares with a
   * non-service type is correctly NOT service-typed here, and its tokens are
   * therefore not deferred. Does not include the built-in `service` type name
   * itself — the up-front deferral adds that separately.
   *
   * The compose-file manager defers these past its up-front `resolveConfigFile`
   * pass — a later dispatch-time pass resolves them once dependencies are
   * deployed. Public because that dispatch-time pass, which lives in the
   * compose runner, reuses it.
   *
   * @returns {string[]} Instance names of a compose-only type.
   */
  getServiceTypedInstanceNames() {
    const names = []
    for (const [name, resolverConfig] of this.#effectiveResolverConfigs()) {
      if (isComposeOnlyType(resolverConfig?.type)) {
        names.push(name)
      }
    }
    return names
  }

  /**
   * Effective stage of each declared service-typed resolver instance, for
   * compose deploy-edge ordering. Reads `stage:` from the same effective block
   * `getServiceTypedInstanceNames` classifies by (`#effectiveResolverConfigs`),
   * so the two answers are identical by construction. Crucially this is not a
   * per-field fallback: if the current-stage block redeclares the instance
   * without a `stage:`, the pinned `stage:` from the default block is NOT
   * inherited (the instance is unpinned = same-stage), matching how the resolver
   * itself would be loaded.
   *
   * The value is left `undefined` when the selected block pins no stage; the
   * compose edge scan then falls back to the run stage, so an unpinned instance
   * orders like the built-in `service` (same stage).
   *
   * Public because compose edge scanning threads this into setDependencies.
   *
   * @returns {Record<string, string|undefined>} instance name -> effective stage
   */
  getServiceTypedInstanceStages() {
    const stages = {}
    for (const [name, resolverConfig] of this.#effectiveResolverConfigs()) {
      if (isComposeOnlyType(resolverConfig?.type)) {
        stages[name] = resolverConfig.stage
      }
    }
    return stages
  }

  /**
   * The distinct keys directly under `pathPrefix` whose unresolved placeholders
   * use one of `providerNames` — as the placeholder's provider or as one of its
   * fallbacks.
   *
   * Answered from the parsed placeholder graph, not from the values. A
   * placeholder nested inside another variable is its own node at the same
   * config path as the one that contains it, so `${opt:${service:db.Name}}`
   * is found through its inner node directly; nothing needs to be walked.
   * Only unresolved placeholders are in the graph — the engine removes a node
   * once it resolves — so a key whose reference an earlier pass already
   * resolved is not reported. Keys whose value holds no placeholder at all (a
   * literal, a number) have no node and are absent. Provider and
   * dedicated-resolver nodes are skipped: they are dependencies of a
   * placeholder, not part of any value.
   *
   * @param {Object} params
   * @param {string[]} params.pathPrefix - Config path whose immediate children
   *   are the keys to report.
   * @param {string[]} params.providerNames - Provider names that qualify a key.
   * @returns {string[]} The qualifying keys, each once.
   */
  getPlaceholderKeysUsingProviders({ pathPrefix, providerNames }) {
    const wantedProviders = new Set(providerNames)
    if (wantedProviders.size === 0) {
      return []
    }
    const graph = this.placeholdersGraph

    const keys = new Set()
    for (const nodeId of graph.nodes()) {
      const nodeLabel = graph.node(nodeId)
      if (!isPlaceholderNode(nodeLabel)) {
        continue
      }
      const key = nodeLabel.path[pathPrefix.length]
      if (
        key === undefined ||
        keys.has(key) ||
        !pathPrefix.every((part, index) => part === nodeLabel.path[index])
      ) {
        continue
      }
      if (placeholderUsesProvider(nodeLabel, wantedProviders)) {
        keys.add(key)
      }
    }
    return [...keys]
  }

  /**
   * Every reference to one of `providerNames` under `pathPrefix`, one entry per
   * fallback of each still-unresolved placeholder, as
   * `{ path, original, providerName, resolverType, key }` (`resolverType` is
   * the optional middle segment of `${provider:resolver:key}`, undefined for
   * the two-segment form).
   *
   * This is the graph's answer to "what does this part of the configuration
   * reference", for callers that used to re-parse the config text: text cannot
   * see a reference that carries a fallback (`${x:a.b, 'c'}`) or sits in
   * fallback position (`${opt:a, x:b.c}`), and it still shows the unresolved
   * form of a reference whose inner variable has since resolved. `key` is the
   * fallback's key as the graph holds it now — resolved inner variables are
   * already substituted; a still-deferred inner reference is left in place
   * (and reported as its own entry, since it is its own node).
   *
   * @param {Object} params
   * @param {string[]} params.pathPrefix - Config path to look under.
   * @param {string[]} params.providerNames - Provider names that qualify a
   *   fallback.
   * @returns {Array<{path: string[], original: string, providerName: string, resolverType: string|undefined, key: string}>}
   *   The references, in graph order.
   */
  getPlaceholderReferences({ pathPrefix, providerNames }) {
    const wantedProviders = new Set(providerNames)
    if (wantedProviders.size === 0) {
      return []
    }
    const references = []
    for (const nodeId of this.placeholdersGraph.nodes()) {
      const nodeLabel = this.placeholdersGraph.node(nodeId)
      if (
        !isPlaceholderNode(nodeLabel) ||
        nodeLabel.resolved !== undefined ||
        !pathPrefix.every((part, index) => part === nodeLabel.path[index])
      ) {
        continue
      }
      for (const fallback of nodeLabel.fallbacks ?? []) {
        if (wantedProviders.has(fallback?.providerName)) {
          references.push({
            path: nodeLabel.path,
            original: nodeLabel.original,
            providerName: fallback.providerName,
            resolverType: fallback.resolverType,
            key: fallback.key,
          })
        }
      }
    }
    return references
  }

  /**
   * Every placeholder still unresolved after a resolution pass whose provider —
   * or one of its fallbacks — is in `providerNames`, as `{ original, path }`.
   *
   * A provider excluded from a pass leaves its tokens as literals in the
   * configuration. The caller that excluded it knows which of those locations a
   * later pass of its own will reach; everywhere else the literal is what ships,
   * so this query is how that caller finds the ones to report. Resolved
   * placeholders are not returned — the engine removes a node once it resolves.
   *
   * @param {Object} params
   * @param {string[]} params.providerNames - Provider names to look for.
   * @returns {Array<{original: string, path: string[]}>} The unresolved
   *   placeholders, in graph order.
   */
  getUnresolvedPlaceholders({ providerNames }) {
    const wantedProviders = new Set(providerNames)
    if (wantedProviders.size === 0) {
      return []
    }
    const unresolved = []
    for (const nodeId of this.placeholdersGraph.nodes()) {
      const nodeLabel = this.placeholdersGraph.node(nodeId)
      if (
        !isPlaceholderNode(nodeLabel) ||
        nodeLabel.resolved !== undefined ||
        !placeholderUsesProvider(nodeLabel, wantedProviders)
      ) {
        continue
      }
      unresolved.push({ original: nodeLabel.original, path: nodeLabel.path })
    }
    return unresolved
  }

  /**
   * One resolution pass scoped to a single config path, with the provider
   * selection the up-front `resolveConfigFile` pass used plus `extraProviders`.
   *
   * Including the up-front selection matters for nesting: a node is only
   * resolved when its own provider AND every provider it depends on is
   * selected, so a token that ENCLOSES a reference to one of `extraProviders`
   * — `${opt:${service:db.OptionName}}` — is only eligible when `opt` is
   * selected too.
   *
   * @param {Object} params
   * @param {string[]} params.pathPrefix - The only config path to resolve under.
   * @param {string[]} [params.extraProviders=[]] - Provider names to add to the
   *   up-front selection for this pass.
   * @returns {Promise<void>}
   */
  async resolveUnderPath({ pathPrefix, extraProviders = [] }) {
    return this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders: [
        ...new Set([...this.#upFrontSelectedProviders, ...extraProviders]),
      ],
      selectedPaths: [pathPrefix],
    })
  }

  async resolveConfigFile({ printResolvedVariables }) {
    // In the compose-file manager the up-front pass must leave service-provider
    // tokens (`${service:...}` and `${shared:...}`-style named instances)
    // untouched so a later dispatch-time pass can resolve them once
    // dependencies are deployed. Excluding these names from the selected
    // providers leaves their tokens as literals. This is purely an up-front
    // *selection* concern — availability gating (`#isProviderAvailableHere`)
    // is unchanged, so the provider remains usable in the dispatch-time pass.
    const effectiveResolvers = this.#effectiveResolverConfigs()
    const deferredNames = this.isComposeConfigFile
      ? new Set([
          ...Object.keys(providerRegistry.providers).filter(
            (type) =>
              isComposeOnlyType(type) &&
              // A user instance named after a compose-only registry type
              // shadows the built-in for loading and for availability gating
              // (both go by DECLARED type). Deferral must agree: when the
              // effective declaration of that name is NOT compose-only, the
              // name belongs to an ordinary resolver and its tokens must
              // resolve in this up-front pass. (A declaration that IS
              // compose-only stays deferred — it comes back via
              // getServiceTypedInstanceNames below.)
              !(
                effectiveResolvers.has(type) &&
                !isComposeOnlyType(effectiveResolvers.get(type)?.type)
              ),
          ),
          ...this.getServiceTypedInstanceNames(),
        ])
      : new Set()

    const providersWithoutPlugins = [
      ...getProviderNamesFromConfigFile(
        this.serviceConfigFile,
        this.stage,
      ).filter((name) =>
        this.#isProviderAvailableHere(
          this.#configuredResolverProviderClass(name),
        ),
      ),
      ...Object.keys(providerRegistry.providers).filter((type) =>
        this.#isProviderAvailableHere(providerRegistry.get(type)),
      ),
      ...(this.composeResolverProviders
        ? Object.keys(this.composeResolverProviders)
        : []),
    ].filter((name) => !deferredNames.has(name))
    this.#upFrontSelectedProviders = providersWithoutPlugins

    await this.resolveParams(providersWithoutPlugins)

    // Resolve the entire service configuration file
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders: providersWithoutPlugins,
    })

    if (this.print && printResolvedVariables) {
      printResult(this.logger, this.serviceConfigFile, this.getReplacements())
    }

    this.params = {
      ...extractCliParams(this.options?.param),
      ...(this.serviceConfigFile.params?.default || {}),
      ...(this.serviceConfigFile.params?.[this.stage] || {}),
      ...(this.serviceConfigFile.stages?.default?.params || {}),
      ...(this.serviceConfigFile.stages?.[this.stage]?.params || {}),
    }

    return {
      resolverManager: this,
      serviceConfigFile: this.serviceConfigFile,
      resolverProviders: this.getResolverProviders(),
      dashboard: this.getDashboard(),
      params: this.params,
    }
  }

  getProvider(name) {
    let provider = this.resolverProviders[name]
    if (!provider) {
      provider = this.#addResolverProvider(name)
    }
    return provider
  }

  getResolver(provider, resolverName, key) {
    // if the resolverName is not provided, for example, ${awsAcc1:myFile}
    if (!resolverName) {
      // check if the provider has a resolver with the key name to support ${awsAcc1:myFile}
      const resolver = provider.resolvers[key]
      if (resolver) {
        return { resolver, type: key }
      }
      // otherwise, use the default resolver to support ${awsAcc1:path/to/ssm}
      resolverName = provider.instance.constructor.defaultResolver
    }
    const resolver = provider.resolvers[resolverName]
    if (!resolver) {
      throw new ServerlessError(
        `${resolverName} resolver of provider ${provider.instance.constructor.type} not found`,
        ServerlessErrorCodes.resolvers.RESOLVER_NOT_FOUND,
      )
    }
    return {
      resolver,
      type: resolverName,
    }
  }

  getWriter(provider, resolverName, key) {
    // if the resolverName is not provided, for example, ${awsAcc1:myFile}
    if (!resolverName) {
      // check if the provider has a resolver with the key name to support ${awsAcc1:myFile}
      const writers = provider.writers[key]
      if (writers) {
        return { writers, type: key }
      }
      // otherwise, use the default resolver to support ${awsAcc1:path/to/ssm}
      resolverName = provider.instance.constructor.defaultResolver
    }
    const writer = provider.writers[resolverName]
    if (!writer) {
      throw new ServerlessError(
        `${resolverName} resolver of provider ${provider.instance.constructor.type} not found`,
        ServerlessErrorCodes.resolvers.RESOLVER_NOT_FOUND,
      )
    }
    return {
      writer,
      type: resolverName,
    }
  }

  async #resolveKey(providerName, provider, resolver, type, key, params) {
    try {
      return await resolver(key, params)
    } catch (error) {
      // Two kinds of error already name the key and the fix, so they surface
      // as-is: wrapping them would repeat the key and bury the teaching text.
      //  - RESOLVER_VALUE_NOT_FOUND: the generic "no value here" a provider
      //    throws instead of returning null when it has something to teach
      //    about the absence (see `resolve()`, where it also lets a declared
      //    fallback apply).
      //  - COMPOSE_COULD_NOT_RESOLVE_PARAM: the service provider's fatal
      //    misuse errors (malformed reference, reference outside a compose
      //    file, unknown alias). They keep a Compose code because the misuse
      //    is Compose-specific; this pass-through is the one place the
      //    manager still names it. The general rule — surface every
      //    ServerlessError unwrapped, envelope only unexpected errors — would
      //    also unwrap the credential and `--param` errors below, a
      //    user-visible message change kept out of this change.
      if (
        error instanceof ServerlessError &&
        (error.code ===
          ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND ||
          error.code ===
            ServerlessErrorCodes.compose.COMPOSE_COULD_NOT_RESOLVE_PARAM)
      ) {
        throw error
      }
      throw new ServerlessError(
        `Failed to resolve variable '${key}' with resolver '${type}' and provider '${providerName}': ${error}`,
        ServerlessErrorCodes.resolvers.RESOLVER_RESOLVE_VARIABLE_ERROR,
      )
    }
  }

  /**
   * Load placeholders from the service configuration file.
   */
  async loadPlaceholders(obj = this.serviceConfigFile) {
    const { graph } = await extractPlaceholderFromObject(
      obj,
      [],
      this.credentialResolverName,
    )
    this.placeholdersGraph = graph
  }

  /**
   * Load all resolvers for the current and default stages.
   */
  async loadAllResolvers() {
    const stagesToProcess = [this.stage, 'default']
    stagesToProcess.forEach((stageName) => {
      const stage = this.serviceConfigFile?.stages?.[stageName]
      if (stage && stage.resolvers) {
        // Check if the stage and its resolvers exist
        Object.keys(stage.resolvers).forEach((providerName) => {
          // Perform the given action for each providerName
          if (!this.placeholdersGraph.hasNode(providerName)) {
            this.placeholdersGraph.setNode(providerName, { provider: true })
          }
        })
      }
    })
  }

  /**
   * Load resolver provider with specified resolver
   */
  loadResolver({ resolverName }) {
    const stagesToProcess = [this.stage, 'default']

    for (const stageName of stagesToProcess) {
      const stage = this.serviceConfigFile?.stages?.[stageName]
      if (stage && stage.resolvers) {
        // Check if the stage and its resolvers exist
        for (const providerName of Object.keys(stage.resolvers)) {
          const resolver = stage.resolvers[providerName]

          // Check if the resolverName exists in the resolvers and if it has a type
          if (resolverName in resolver && resolver[resolverName].type) {
            this.placeholdersGraph.setNode(providerName, { provider: true })
            return { providerName } // Exit the function early if resolver is found
          }
        }
      }
    }

    // If no resolver is found, throw an error
    throw new Error(`Resolver ${resolverName} not found`)
  }

  async resolveStage() {
    // Return early if `this.stage` is already set.
    if (this.stage) {
      return this.stage
    }

    const stage = this.serviceConfigFile?.provider?.stage

    // Set default stage if undefined or null.
    if (!stage) {
      this.stage = 'dev'
      return this.stage
    }

    // Set the stage directly if it does not include a placeholder.
    if (!stage.includes('${')) {
      this.stage = stage
      return this.stage
    }

    // Extract placeholders from the stage property.
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders: ResolverManager.limitedProvidersSet,
      selectedPaths: [['provider', 'stage']],
    })

    this.stage = this.serviceConfigFile.provider.stage
    return this.stage
  }

  async resolveProviderResolver() {
    await this.resolveAndReplacePlaceholdersInConfig({
      selectedProviders: ResolverManager.limitedProvidersSet,
      selectedPaths: [['provider', 'resolver']],
    })
  }

  /**
   * @typedef {Object} NodeLabel
   * @property {string[]} path - The path of the node.
   * @property {string} providerName - The name of the provider.
   * @property {string} resolverType - The type of the resolver.
   * @property {string} key - The key of the node.
   * @property {string} original - The original value of the node.
   * @property {string} resolved - The resolved value of the node.
   * @property {boolean} provider - Whether the node is a provider.
   */

  /**
   * Resolve and replace placeholders in the service configuration file using a graph.
   * @param {Object} [options={}] - The options.
   * @param {string[]} [options.selectedProviders=[]] - The selected providers.
   * @param {string[]} [options.selectedPaths=[]] - The selected paths.
   */
  async resolveAndReplacePlaceholdersInConfig({
    selectedProviders = [],
    selectedPaths = [],
  } = {}) {
    await this.#resolveAndReplacePlaceholders({
      selectedProviders,
      selectedPaths,
      graph: this.placeholdersGraph,
    })
  }

  /**
   * Resolve and replace placeholders in the service configuration file using a graph.
   * @param {Object} [options={}] - The options.
   * @param {string[]} [options.selectedProviders=[]] - The selected providers.
   * @param {string[]} [options.selectedPaths=[]] - The selected paths.
   * @param {Graph} [options.graph] - The graph.
   */
  async #resolveAndReplacePlaceholders({
    selectedProviders = [],
    selectedPaths = [],
    graph,
  } = {}) {
    const filteredGraph = this.#createFilteredGraph(
      graph,
      selectedPaths,
      selectedProviders,
    )
    // Save the active-pass context on entry and restore it on exit; each pass
    // also gets its own `state`. Do NOT clear `graphBeingProcessed` or share one
    // `processingState` across passes.
    //
    // Resolution is re-entrant: a JS/TS file resolver can call resolveVariable()
    // or resolveConfigurationProperty(), which open a nested pass here. The
    // fields must always point at the innermost running pass and fall back to
    // its parent when it exits. If a nested pass cleared them instead, the
    // still-running outer pass would look inactive, and a later re-entrant call
    // would start its own narrow pass (scoped to a temporary property) that runs
    // alongside the outer pass and can leave nested placeholders unresolved.
    // Stacking the context keeps re-entrant calls on the outermost (unscoped)
    // pass so the full dependency chain resolves cooperatively.
    const previousGraph = this.graphBeingProcessed
    const previousState = this.processingState
    const state = {}
    this.graphBeingProcessed = filteredGraph
    this.processingState = state
    try {
      await processGraphInParallel(
        filteredGraph,
        async (nodeName) => {
          const nodeLabel = filteredGraph.node(nodeName)
          if (nodeLabel?.provider) {
            this.#handleProviderNode(nodeName)
          } else if (nodeLabel?.dedicatedResolverConfig) {
            this.#handleDedicatedResolverNode(nodeName, filteredGraph)
          } else {
            await this.#handlePlaceholderNode(
              nodeName,
              nodeLabel,
              filteredGraph,
              selectedProviders,
              selectedPaths,
            )
          }
        },
        graph,
        state,
      )
    } finally {
      this.graphBeingProcessed = previousGraph
      this.processingState = previousState
    }
  }

  #addResolverProvider = (nodeName) => {
    const isNotAddedYet = !this.resolverProviders[nodeName]
    const isInheritedFromCompose = this.composeResolverProviders[nodeName]
    // Both questions below — is this name declared, and with what block — come
    // from the one whole-block `[stage, 'default']` selection every other
    // resolver-block question goes through, so construction cannot drift from
    // classification or from how `loadProvider` picks the block.
    const effectiveResolvers = this.#effectiveResolverConfigs()
    const isCustomResolver = effectiveResolvers.has(nodeName)
    // A built-in of this name only competes with an inherited instance where
    // that built-in is available: a child service must keep the compose file's
    // own `service`-named instance, since the compose-only built-in does not
    // exist for it.
    const DefaultProvider = providerRegistry.get(nodeName)
    const isDefaultResolver =
      !!DefaultProvider && this.#isProviderAvailableHere(DefaultProvider)
    const shouldBeOverwritten =
      isInheritedFromCompose && (isCustomResolver || isDefaultResolver)

    if (isNotAddedYet || shouldBeOverwritten) {
      const dedicatedResolverConfig = effectiveResolvers.get(nodeName) ?? {
        type: nodeName,
      }
      const resolverProvider = createResolverProvider(
        dedicatedResolverConfig,
        this.serviceConfigFile,
        this.configFileDirPath,
        this.options,
        this.stage,
        this.dashboard,
        this.composeParams,
        this.resolveVariable.bind(this),
        this.resolveConfigurationProperty.bind(this),
        log.get(`core:resolver:${nodeName}`),
        this.versionFramework,
      )
      this.logger.debug(
        `adding resolver provider ${nodeName} with config`,
        dedicatedResolverConfig,
      )
      this.addResolverProvider(nodeName, resolverProvider)
      return resolverProvider
    }
  }

  /**
   * Handle a provider node.
   * This method is responsible for creating a provider
   * using the provider configuration in the service configuration file.
   * @param {string} nodeName - The name of the node.
   */
  #handleProviderNode(nodeName) {
    this.#addResolverProvider(nodeName)
  }

  /**
   * Handle a dedicated resolver node.
   * This method is used to create resolvers that support legacy
   * placeholder formats like ${ssm(eu-west-1, raw):/path/to/secureparam}
   * or ${file(./myFile.json):someProperty}
   * @param {string} nodeName - The name of the node.
   * @param {Graph} graph - The graph.
   */
  #handleDedicatedResolverNode(nodeName, graph) {
    const nodeLabel = graph.node(nodeName)
    const dedicatedResolverConfig = nodeLabel?.dedicatedResolverConfig
    this.logger.debug(`adding resolver for aws credential resolver ${nodeName}`)

    const credentialResolver =
      this.resolverProviders[this.credentialResolverName]

    if (!credentialResolver) {
      throw new ServerlessError(
        `Credential resolver ${this.credentialResolverName} not found`,
        ServerlessErrorCodes.resolvers.RESOLVER_NOT_FOUND,
      )
    }

    addResolversForProvider(
      dedicatedResolverConfig,
      credentialResolver.instance,
      credentialResolver.resolvers,
      credentialResolver.writers,
    )
  }

  /**
   * Handle a placeholder node.
   * This method is responsible for resolving a placeholder node
   * in the placeholders graph.
   * @param {string} nodeName - The name of the node.
   * @param {NodeLabel} nodeLabel - The label of the node.
   * @param {Graph} graph - The filtered graph.
   * @param {string[]} selectedProviders - The selected providers.
   * @param {string[]} selectedPaths - The selected paths.
   */
  async #handlePlaceholderNode(
    nodeName,
    nodeLabel,
    graph,
    selectedProviders,
    selectedPaths,
  ) {
    const {
      path,
      original,
      resolvedValue,
      providerName,
      providerType,
      resolverType,
      key,
      parent,
    } = await this.resolve(nodeLabel)

    this.#replacePlaceholderInConfig(
      path,
      original,
      resolvedValue,
      parent,
      this.serviceConfigFile,
    )

    const newNodeIds = await this.#resolvePlaceholdersInResolvedValue(
      providerType,
      resolverType,
      key,
      resolvedValue,
      graph,
      path,
      nodeLabel,
      selectedProviders,
      selectedPaths,
    )

    if (newNodeIds.length === 0) {
      // If the node did not resolve to any new placeholders, mark it as resolved
      nodeLabel.resolve()
    } else {
      // If the node resolved to new placeholders, create a Promise.all
      // from the promises of the new nodes to wait for their resolution
      // before marking the node as resolved
      const promises = newNodeIds.map((id) => graph.node(id).promiseResolved)
      // Delay resolving until Promise.all(promises) completes
      Promise.all(promises).then(nodeLabel.resolve)
    }

    nodeLabel.resolved = resolvedValue
    this.logger.debug(
      `resolved ${original} to ${JSON.stringify(resolvedValue, null, 2)}`,
    )
    this.#updatePredecessorNodes(nodeName, original, resolvedValue, graph)
    this._replacements.push({
      path: path.join('.'),
      original,
      resolved: resolvedValue,
      providerName,
      providerType,
      resolverType,
      key,
    })
  }

  resolve = async (nodeLabel) => {
    const { path, original, fallbacks, parent } = nodeLabel
    for (const [fallbackIndex, fallback] of fallbacks.entries()) {
      const hasAnotherFallback = fallbackIndex < fallbacks.length - 1
      if (fallback?.literalValue !== undefined) {
        return {
          path,
          original,
          resolvedValue: fallback.literalValue,
          providerName: 'literal value',
          providerType: 'literal value',
          resolverType: 'literal value',
          key: 'literal value',
        }
      }
      let { providerName, resolverType, key, params } = fallback
      // If the providerName is 'aws' and the AWS resolver with 'aws' name
      // is not defined in the service configuration file, use the
      // credential resolver instead
      if (providerName === 'aws' && !this.#isAwsNamedResolverInConfig()) {
        providerName = this.credentialResolverName
      }
      const provider = this.getProvider(providerName)
      const providerType = provider?.instance?.constructor?.type
      if (providerType) this.providersUsed.add(providerType)
      const { resolver, type } = this.getResolver(provider, resolverType, key)
      let resolvedValue
      try {
        resolvedValue = await this.#resolveKey(
          providerName,
          provider,
          resolver,
          type,
          key,
          params,
        )
      } catch (error) {
        // A provider that reports "no value here" by THROWING would otherwise
        // deny the variable its declared fallbacks, unlike one that returns
        // null (`${aws:cf:...}` does, so `${aws:cf:stack.Out, 'x'}` falls
        // back). Give the remaining fallbacks their turn; with none left the
        // provider's own error is what the user sees, unchanged.
        if (!hasAnotherFallback || !isRecoverableResolutionError(error)) {
          throw error
        }
        this.logger.debug(
          `provider '${providerType}', resolver '${type}' could not resolve '${key}' (${error.message}) - skipping to next fallback.`,
        )
        continue
      }
      if (resolvedValue != null) {
        return {
          path,
          original,
          resolvedValue,
          providerName,
          providerType,
          resolverType: type,
          key,
          parent,
        }
      }
      this.logger.debug(
        `provider '${providerType}', resolver '${type}' resolved '${key}' to '${resolvedValue}' - skipping to next fallback.`,
      )
    }
    throw new ServerlessError(
      `Cannot resolve '${original}' variable at '${path?.join('.')}'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.`,
      ServerlessErrorCodes.resolvers.RESOLVER_MISSING_VARIABLE_RESULT,
    )
  }

  /**
   * Add a value from configuration to the placeholders graph.
   * @param str - The value to add to the graph.
   * @param path - The path of the value in the configuration.
   * @returns {Promise<[string]>} - The node IDs of the added nodes.
   */
  async addToPlaceholdersGraph(str, path) {
    return await collectFromObject(
      str,
      path,
      [this.placeholdersGraph],
      this.credentialResolverName,
    )
  }

  /**
   * Resolves and replaces placeholders within the resolved value of a configuration property.
   * This method is invoked for non-file type providers and when the key does not match
   * specific file extensions (.js, .cjs, .mjs, .ts). It extracts placeholders from the
   * resolved value, creates a graph for these placeholders, and then resolves and replaces
   * these placeholders within the resolved value. This ensures that any dynamic values
   * embedded within the resolved value are fully resolved before being used in the configuration.
   *
   * @param {string} providerType - The type of the provider that resolved the value.
   * @param {string} resolverType - The type of the resolver used to resolve the value.
   * @param {string} key - The key associated with the resolved value.
   * @param {*} resolvedValue - The value that was resolved by the provider.
   * @param {Graph} graph - The graph containing the nodes and their relationships.
   * @param {string[]} path - The path within the configuration where the resolved value is located.
   * @param {NodeLabel} nodeLabel - The label of the node.
   * @param {string[]} selectedProviders - The selected providers.
   * @param {string[]} selectedPaths - The selected paths.
   */
  async #resolvePlaceholdersInResolvedValue(
    providerType,
    resolverType,
    key,
    resolvedValue,
    graph,
    path,
    nodeLabel,
    selectedProviders,
    selectedPaths,
  ) {
    if (!(
      providerType === 'file' &&
      resolverType === 'file' &&
      /\.(js|cjs|mjs|ts)$/.test(key)
    )) {
      // Extract placeholders from the resolved value
      // and add them to the placeholders graph
      const newNodeIds = await collectFromObject(
        resolvedValue,
        path,
        [this.placeholdersGraph],
        this.credentialResolverName,
        nodeLabel?.parent,
      )

      if (newNodeIds.length > 0) {
        throwIfCyclesFound(this.placeholdersGraph)
      }

      const addedNodeIds = []

      // Add the new nodes to the filtered graph if they meet the selection criteria
      newNodeIds.forEach((id) => {
        if (
          shouldAddNodeToGraph(
            this.placeholdersGraph,
            id,
            selectedPaths,
            selectedProviders,
            this.stage,
          )
        ) {
          const placeholder = this.placeholdersGraph.node(id)
          addPlaceholderToGraph(
            id,
            [graph],
            placeholder,
            placeholder.parent,
            placeholder.path,
            this.credentialResolverName,
          )
          addedNodeIds.push(id)
        }
      })
      return addedNodeIds
    }
    return []
  }

  /**
   * Updates placeholders within a predecessor node in the graph.
   * This method iterates through the fallbacks of a given predecessor node,
   * replacing occurrences of the original value with the resolved value in
   * both the `resolverProviderConfig` and the `key` fields of the fallbacks.
   * It also updates the `original` field of the node if the node is not a provider.
   *
   * @param {string} predecessor - The name of the predecessor node to update.
   * @param {Graph} graph - The graph containing the nodes and their relationships.
   * @param {string} original - The original value to be replaced.
   * @param {any} resolvedValue - The new value to replace the original value with.
   */
  #updateNodePlaceholders(predecessor, graph, original, resolvedValue) {
    const predecessorLabel = graph.node(predecessor)
    if (predecessorLabel.fallbacks) {
      for (const fallback of predecessorLabel.fallbacks) {
        if (fallback?.dedicatedResolverConfig) {
          deepReplace(fallback.dedicatedResolverConfig, original, resolvedValue)
        }
      }
    }
    if (
      !predecessorLabel?.provider &&
      !predecessorLabel?.dedicatedResolverConfig
    ) {
      if (predecessorLabel.original === original) {
        predecessorLabel.original = resolvedValue
      } else {
        predecessorLabel.original = predecessorLabel.original.replace(
          original,
          resolvedValue,
        )
      }
      for (const fallback of predecessorLabel.fallbacks) {
        if (fallback?.key) {
          fallback.key = fallback.key.replace(original, resolvedValue)
        }
        if (fallback?.params) {
          deepReplace(fallback.params, original, resolvedValue)
        }
      }
    }
  }

  /**
   * Update predecessor nodes.
   * This method is responsible for updating the predecessor nodes in the placeholders graph.
   * @param {string} nodeName - The name of the node.
   * @param {string} original - The original value.
   * @param {string} resolvedValue - The resolved value.
   * @param {Graph} graph - The graph.
   */
  #updatePredecessorNodes(nodeName, original, resolvedValue, graph) {
    const visited = new Set()
    const updatePredecessorsRecursively = (graph, currentNode) => {
      const predecessors = graph.predecessors(currentNode)
      if (!predecessors) return

      for (const predecessor of predecessors) {
        if (visited.has(predecessor)) continue
        visited.add(predecessor)

        this.#updateNodePlaceholders(
          predecessor,
          graph,
          original,
          resolvedValue,
        )
        updatePredecessorsRecursively(graph, predecessor)
      }
    }
    updatePredecessorsRecursively(this.placeholdersGraph, nodeName)
    updatePredecessorsRecursively(graph, nodeName)
  }

  /**
   * Create a filtered graph from the original graph.
   * @param {Graph} originalGraph - The original graph.
   * @param {string[]} [startPaths=[]] - The start paths.
   * @param {string[]} [selectedProviders=[]] - The selected providers.
   * All nodes in the filtered graph will be successors of this node.
   * @returns {Graph} - The filtered graph.
   */
  #createFilteredGraph(originalGraph, startPaths = [], selectedProviders = []) {
    // Create a new graph instance
    const newGraph = new Graph()

    // Iterate over all nodes in the original graph
    originalGraph.nodes().forEach((nodeId) => {
      if (
        shouldAddNodeToGraph(
          originalGraph,
          nodeId,
          startPaths,
          selectedProviders,
          this.stage,
        )
      ) {
        // Directly use the nodeLabel object to ensure changes are reflected in both graphs
        newGraph.setNode(nodeId, originalGraph.node(nodeId))
      }
    })

    // Copy out edges of the nodes in the new graph from the original graph
    newGraph.nodes().forEach((nodeId) => {
      copyOutEdgesRecursively(newGraph, originalGraph, nodeId)
    })
    return newGraph
  }

  // Helper method to replace a placeholder within the configuration.
  // This method navigates to the correct path and performs a string replacement.
  #replacePlaceholderInConfig(
    path,
    originalPlaceholder,
    resolvedValue,
    parent,
    object,
  ) {
    let currentValue = this.#getValueAtPath(object, path)
    if (typeof currentValue !== 'string') {
      throw new ServerlessError(
        `Failed to resolve placeholder '${originalPlaceholder}' at path '${path?.join(
          '.',
        )}'. The value at this path is ${typeof currentValue}, but it should be a string.`,
        ServerlessErrorCodes.resolvers.RESOLVER_NON_STRING_CONFIG_KEY,
      )
    }
    // If the value at path is entirely equal to the original placeholder,
    // replace it with the resolved value
    if (currentValue === originalPlaceholder) {
      this.#setResolvedValueAtPath(object, path, resolvedValue)
      return
    }
    if (parent === null) {
      // Try to convert the resolved value to a string
      resolvedValue = convertToString(resolvedValue)
      // Throw an error if the resolved value cannot be converted to a string
      if (resolvedValue === null) {
        throw new ServerlessError(
          `Failed to resolve placeholder '${originalPlaceholder}' at path '${path?.join(
            '.',
          )}'. String value consist of variable which resolve with non-string value.`,
          ServerlessErrorCodes.resolvers.RESOLVER_NON_STRING_VARIABLE_RESULT,
        )
      }
    }
    // Perform a string replacement of the original placeholder with the resolved value
    currentValue = currentValue.replace(originalPlaceholder, resolvedValue)
    this.#setResolvedValueAtPath(object, path, currentValue)
  }

  #getValueAtPath(object, pathArray) {
    let currentValue = object
    for (const key of pathArray) {
      if (currentValue[key] === undefined) return undefined
      currentValue = currentValue[key]
    }
    return currentValue
  }

  #setResolvedValueAtPath(object, pathArray, value) {
    let current = object
    for (let i = 0; i < pathArray.length - 1; i++) {
      const key = pathArray[i]
      if (!(key in current)) {
        current[key] = {}
      }
      current = current[key]
    }
    current[pathArray[pathArray.length - 1]] = value
  }

  #isAwsNamedResolverInConfig() {
    const stagesToCheck = ['default', this.stage]
    for (const stageName of stagesToCheck) {
      const resolvers = this.serviceConfigFile.stages?.[stageName]?.resolvers
      if (resolvers && Object.keys(resolvers).includes('aws')) {
        return true
      }
    }
    return false
  }

  /**
   * Resolve a variable once.
   * If the resolved value contains another variable, it will not be resolved.
   *
   * @param variableString
   * @returns {Promise<string>} - The resolved value of the variable.
   */
  async resolveVariableOnce(variableString) {
    // Extract placeholders from the resolved value
    const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
      variableString,
      this.credentialResolverName,
    )
    if (!placeholder) {
      throw new ServerlessError(
        `Failed to resolve variable '${variableString}': No placeholders found`,
        ServerlessErrorCodes.resolvers.RESOLVER_NO_VARIABLES_FOUND,
      )
    }

    const { resolvedValue } = await this.resolve(placeholder)
    return resolvedValue
  }

  /**
   * Resolve a variable.
   * If a variable returns a value with another variable, it will be resolved recursively.
   *
   * @param variableString
   * @returns {Promise<string>} - The resolved value of the variable.
   */
  async resolveVariable(variableString) {
    let resolvedValue
    // generate random property name
    const randomPropertyName = `resolveVariable_${Math.random().toString(36).substring(7)}`
    try {
      // add the variable to the serviceConfigFile
      this.serviceConfigFile[randomPropertyName] = '${' + variableString + '}'

      // if function is called when no processing is happening
      // then add the variable to the placeholdersGraph and start processing
      if (!this.graphBeingProcessed) {
        // add the variable to the placeholdersGraph
        await collectFromObject(
          this.serviceConfigFile[randomPropertyName],
          [randomPropertyName],
          [this.placeholdersGraph],
          this.credentialResolverName,
        )
        // start variable resolution at a path of the variable
        // and wait for completion
        await this.resolveAndReplacePlaceholdersInConfig({
          selectedPaths: [[randomPropertyName]],
        })
      } else {
        // if function is called when processing is happening
        // then add the variable to the graph being processed
        const newNodeIds = await collectFromObject(
          this.serviceConfigFile[randomPropertyName],
          [randomPropertyName],
          [this.graphBeingProcessed],
          this.credentialResolverName,
        )

        // notify that a new node has been added
        this.processingState.notifyNewNode()

        // wait for the new nodes to be resolved
        await Promise.all(
          newNodeIds.map(
            (id) => this.graphBeingProcessed.node(id).promiseResolved,
          ),
        )
      }
      resolvedValue = this.serviceConfigFile[randomPropertyName]
      return resolvedValue
    } catch (e) {
      this.logger.debug(`failed to resolve variable ${variableString}: ${e}`)
      throw e
    } finally {
      // remove the variable from the serviceConfigFile
      delete this.serviceConfigFile[randomPropertyName]
    }
  }

  async resolveConfigurationProperty(keys) {
    await this.resolveAndReplacePlaceholdersInConfig({ selectedPaths: [keys] })
    return _.get(this.serviceConfigFile, keys.join('.'))
  }
}

const deepReplace = (object, original, resolvedValue) => {
  _.forIn(object, function (value, key) {
    if (typeof value === 'string') {
      if (value === original) {
        object[key] = resolvedValue
      } else {
        object[key] = value.replace(original, resolvedValue)
      }
    } else if (_.isObject(value)) {
      deepReplace(value, original, resolvedValue)
    }
  })
}

const convertToString = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  // Do not convert if toString is Object.prototype.toString
  const valueToString = value.toString
  if (
    typeof valueToString !== 'function' ||
    valueToString === Object.prototype.toString
  ) {
    return null
  }
  try {
    return '' + value
  } catch (error) {
    return null
  }
}

function isNodeAndOutEdgesSelected(graph, nodeId, selectedProviders) {
  if (!selectedProviders.length) {
    return true
  }
  const nodeLabel = graph.node(nodeId)
  if (!isNodeSelected(selectedProviders, nodeId, nodeLabel)) {
    return false
  }

  return graph.outEdges(nodeId).every((edge) => {
    return isNodeAndOutEdgesSelected(graph, edge.w, selectedProviders)
  })
}

const isNodeSelected = (selectedProviders, nodeId, nodeLabel) => {
  return (
    isSelectedProviderNode(selectedProviders, nodeId, nodeLabel) ||
    nodeLabel?.fallbacks?.every((fallback) =>
      isSelectedFallback(selectedProviders, fallback),
    )
  )
}

const isSelectedProviderNode = (selectedProviders, nodeId, nodeLabel) => {
  return (
    (nodeLabel.provider && selectedProviders.includes(nodeId)) ||
    selectedProviders.includes(nodeLabel.dedicatedResolverConfig?.type)
  )
}

const isSelectedFallback = (selectedProviders, fallback) => {
  return (
    selectedProviders.includes(fallback.providerName) ||
    selectedProviders.includes(fallback.dedicatedResolverConfig?.type) ||
    Object.prototype.hasOwnProperty.call(fallback, 'literalValue')
  )
}

const copyOutEdgesRecursively = (newGraph, originalGraph, nodeId) => {
  originalGraph.outEdges(nodeId).forEach((edge) => {
    const { v, w } = edge
    if (!newGraph.hasNode(w)) {
      const label = originalGraph.node(w)
      newGraph.setNode(w, label)
    }
    newGraph.setEdge(v, w, edge)
    // Recursively copy out edges of the current node
    copyOutEdgesRecursively(newGraph, originalGraph, w)
  })
}

const extractCliParams = (paramsFromOptions) => {
  const cliParams = {}
  paramsFromOptions?.forEach((paramString) => {
    const [key, value] = paramString?.split('=') ?? []
    if (key) {
      cliParams[key] = value
    }
  })
  return cliParams
}

const shouldAddNodeToGraph = (
  originalGraph,
  nodeId,
  startPaths,
  selectedProviders,
  stage,
) => {
  const nodeLabel = originalGraph.node(nodeId)
  // Check if the node has already been resolved
  const isResolved = nodeLabel?.resolved !== undefined

  // Check if the node's path starts with any of the specified start paths
  const pathMatches =
    startPaths.length === 0 ||
    (nodeLabel?.path &&
      startPaths.some((startPath) => {
        return startPath.every((part, index) => part === nodeLabel.path[index])
      }))

  // Check if the node's path is not a param of other stages than 'default' or the given stage
  const pathNotOtherStageParam =
    !(
      nodeLabel?.path?.[0] === 'params' &&
      nodeLabel?.path?.[1] &&
      nodeLabel?.path?.[1] !== 'default' &&
      nodeLabel?.path?.[1] !== stage
    ) &&
    !(
      nodeLabel?.path?.[0] === 'stages' &&
      nodeLabel?.path?.[2] &&
      nodeLabel?.path?.[2] === 'params' &&
      nodeLabel?.path?.[1] &&
      nodeLabel?.path?.[1] !== 'default' &&
      nodeLabel?.path?.[1] !== stage
    )

  // Check if the provider matches for the node and its out edges
  const providerMatches = isNodeAndOutEdgesSelected(
    originalGraph,
    nodeId,
    selectedProviders,
  )

  // Return whether the node meets all conditions
  return pathMatches && providerMatches && pathNotOtherStageParam && !isResolved
}
