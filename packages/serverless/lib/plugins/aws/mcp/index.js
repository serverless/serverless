import { log, ServerlessError } from '@serverless/util'
import { formatMcpEndpoints, serviceEndpointOf } from './lib/endpoints.js'
import {
  artifactModulePath,
  assertNoPrebuiltArtifact,
  mcpEntryHandler,
  mcpEntrySourcePath,
  publicBaseUrl,
  stageEntry,
  unstageEntry,
  warnPartiallyBundledServers,
  warnStrippedDevDependencies,
} from './lib/packaging.js'
import {
  byoRoleArnFor,
  warnMissingStateGrants,
} from './lib/permission-check.js'
import { buildRouteDescriptors } from './lib/route-descriptors.js'
import mcpSchema from './lib/schema.js'
import {
  compileStateResources,
  stateIamStatement,
  stateIamStatements,
  stateKeyRefs,
} from './lib/state-resources.js'
import { synthesizeFunctions } from './lib/synthesize-functions.js'
import { validateMcp } from './lib/validate.js'

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

class AwsMcp {
  constructor(serverless, options) {
    this.serverless = serverless
    // `deploy function` names its target here, and that command packages and
    // deploys that one function only.
    this.options = options || {}
    this.provider = serverless.getProvider('aws')
    // Overridable so this plugin's own tests do not depend on a built bundle:
    // the entry is a build product, absent from a fresh checkout until
    // `npm run build:mcp:entry` runs.
    this.entrySourcePath = mcpEntrySourcePath

    serverless.configSchemaHandler.defineTopLevelProperty('mcp', mcpSchema())

    this.hooks = {
      initialize: async () => {
        const mcp = this.getMcpConfig()
        if (!mcp) return
        // A top-level `mcp` key is not necessarily ours to interpret: under
        // the default configValidationMode ("warn") a service reaches this
        // hook with a block of any shape - including a stray key some other
        // tool owns, which before this plugin existed drew only the
        // unrecognized-property warning and deployed on. Only a block
        // carrying a `servers` object declares MCP servers; any other shape
        // stays a schema-validation concern (warned or thrown per the
        // service's configValidationMode) and the plugin stands down exactly
        // as it does on a service with no `mcp` at all.
        if (!isPlainObject(mcp) || !isPlainObject(mcp.servers)) return
        // Defense in depth: under a non-aws provider this plugin IS
        // provider-scoped (the AwsProvider instance lands on `this.provider`,
        // which the plugin manager reads for scoping), so its hooks are
        // discarded and this guard is unreachable through normal plugin
        // loading. It exists for embedders that invoke hooks directly.
        if (!this.provider) {
          throw new ServerlessError(
            'The "mcp" property deploys MCP servers to AWS and requires the "aws" provider, but this service uses a different provider. Remove the "mcp" block or switch "provider.name" to "aws".',
            'MCP_AWS_PROVIDER_REQUIRED',
            { stack: false },
          )
        }
        this.validated = validateMcp({
          mcp,
          functions: this.serverless.service.functions,
          providerRuntime: this.serverless.service.provider.runtime,
          naming: this.provider.naming,
        })
        // `setFunctionNames` (lib/serverless.js) has already run by the time
        // any hook fires, so every synthesized function carries an explicit
        // `name`.
        Object.assign(
          this.serverless.service.functions,
          synthesizeFunctions({
            servers: this.validated.servers,
            serviceName: this.serverless.service.service,
            stage: this.provider.getStage(),
          }),
        )
        this.applyStateKeyReferences()
      },
      // Staging has to beat the esbuild plugin's build-and-package hook on this
      // same event, because that hook globs `package.patterns` while assembling
      // the zip. It does: `../../../classes/plugin-manager.js` registers this
      // plugin ahead of the esbuild one, and hooks on one event run in plugin
      // registration order.
      'before:package:createDeploymentArtifacts': () => this.stageEntry(),
      'before:deploy:function:packageFunction': async () => {
        this.warnDeployFunctionSkipsEnvironment()
        await this.stageEntry(this.options.function)
      },
      // The window for the handler swap opens the moment esbuild's packaging
      // hook returns (it has to build and zip the user's own module) and closes
      // when `compileFunctions` reads the handler.
      // `after:package:createDeploymentArtifacts` sits in it too, but dev mode
      // replaces that hook with a no-op for every plugin but its own
      // (`../dev/index.js`), so a swap there would silently stop running.
      'before:package:compileFunctions': () => this.repointFunctions(),
      // `deploy function` never reaches `compileFunctions`: it reads the handler
      // one event later, in `updateFunctionConfiguration`
      // (`../deploy-function.js`), and only for the function it targets.
      'after:deploy:function:packageFunction': async () => {
        this.warnDeployFunctionSkipsEnvironment()
        await this.repointFunctions(this.options.function)
      },
      // The staged file outlives the artifact it went into, so it is cleaned up
      // per command run rather than per packaging event: `finalize` is the last
      // thing a successful run does and `error` the last thing a failed one does
      // (`../../../classes/plugin-manager.js`), which together cover `package`,
      // `deploy` and `deploy function` without one hook per command. A hard
      // crash still bypasses both - hence the deterministic staged name, which
      // the next run overwrites.
      finalize: () => this.unstageEntry(),
      error: () => this.unstageEntry(),
      'before:package:compileEvents': async () => {
        if (!this.validated) return
        const apiGatewayPlugin = this.serverless.pluginManager.plugins.find(
          (plugin) => typeof plugin.registerExternalHttpEvents === 'function',
        )
        if (!apiGatewayPlugin) {
          throw new ServerlessError(
            'MCP servers are exposed through an API Gateway REST API, but the API Gateway compiler plugin was not found. This is an internal error - please report it at https://github.com/serverless/serverless/issues.',
            'MCP_API_GATEWAY_PLUGIN_NOT_FOUND',
            { stack: false },
          )
        }
        apiGatewayPlugin.registerExternalHttpEvents(
          buildRouteDescriptors({ servers: this.validated.servers }),
        )
        compileStateResources({
          servers: this.validated.servers,
          template:
            this.serverless.service.provider.compiledCloudFormationTemplate,
          naming: this.provider.naming,
        })
      },
      // Both commands route through the info plugin's `aws:info` entrypoint,
      // which finishes gathering stack outputs during `info:info` /
      // `deploy:deploy` - before any `after:` hook for those events runs.
      'after:info:info': () => this.addMcpServiceOutputs(),
      'after:deploy:deploy': async () => {
        this.addMcpServiceOutputs()
        await this.checkStateKeyGrants()
      },
    }
  }

  /**
   * Dev mode owns the artifact and the handler of every Node function it
   * redirects (`../dev/index.js` sets `handler = 'index.handler'` after moving
   * the user's own to `originalHandler`), and it builds that artifact itself.
   * Staging into it and swapping the handler would both be overwritten or
   * clobbering, so the whole packaging integration stands down.
   */
  isDevMode() {
    return this.serverless.devmodeEnabled === true
  }

  /**
   * Say out loud, once per run, that the packaging integration stood down.
   *
   * Standing down is not the same as doing nothing visible: dev mode still
   * deploys the synthesized functions, pointing at the user's module with no
   * entry in front of it, so the deployed endpoint answers nothing an MCP
   * client understands. Without this line that failure is only discoverable by
   * calling the endpoint.
   */
  warnDevModeUnsupported() {
    if (this._devModeWarned) return
    this._devModeWarned = true
    log.warning(
      'MCP servers are not supported in Dev Mode in this release - requests to the deployed endpoint will fail. Deploy normally with "serverless deploy" to exercise them.',
    )
  }

  serviceDir() {
    return this.serverless.config?.serviceDir ?? this.serverless.serviceDir
  }

  /**
   * The MCP server functions a packaging run covers, paired with their function
   * objects.
   *
   * `onlyFunction` is the `deploy function` target: that command builds one
   * artifact, for that function alone, so nothing else is being packaged.
   */
  packagedServerFunctions(onlyFunction) {
    return this.validated.servers
      .filter(
        (server) => onlyFunction === undefined || server.name === onlyFunction,
      )
      .map((server) => ({
        name: server.name,
        functionObject: this.serverless.service.functions[server.name],
      }))
  }

  /**
   * The prebuilt entry, into the service dir and onto the packaging patterns.
   *
   * A `deploy function` target that is not an MCP server has nothing to stage
   * for - and the pattern would carry the entry into an unrelated function's
   * zip.
   */
  async stageEntry(onlyFunction) {
    if (!this.validated) return
    if (this.isDevMode()) {
      this.warnDevModeUnsupported()
      return
    }
    const serverFunctions = this.packagedServerFunctions(onlyFunction)
    if (serverFunctions.length === 0) return
    const service = this.serverless.service
    service.package = service.package || {}
    // Ahead of staging, so nothing is written and no handler is swapped for an
    // artifact that would never carry the entry. Reading the artifact here also
    // reads only what the USER configured: the esbuild plugin sets
    // `package.artifact` itself, on this same event but after this hook.
    assertNoPrebuiltArtifact({
      servicePackage: service.package,
      serverFunctions,
    })
    await stageEntry({
      serviceDir: this.serviceDir(),
      servicePackage: service.package,
      functionObjects: serverFunctions.map(
        ({ functionObject }) => functionObject,
      ),
      source: this.entrySourcePath,
    })
    // Set after the copy, not before it: cleanup removes the staged file, and it
    // may only do that once this run is known to have written it.
    this._entryStaged = true
  }

  /**
   * Say that `deploy function` will not update this server's environment.
   *
   * `updateFunctionConfiguration` drops the WHOLE environment update when any
   * value is a non-string object (`../deploy-function.js`: `params.Environment`
   * is deleted when `Object.values(...).some(_.isObject)`), and `state: true`
   * puts a `{Ref}` to the provisioned key there. The code is then updated and
   * the environment silently is not, so a changed `environment:` block appears
   * deployed while the function keeps running with the old values.
   *
   * Warned rather than worked around: resolving the `{Ref}` here would mean
   * looking the key up in the deployed stack, and the values the command does
   * apply are correct - it is only the environment that needs a full deploy.
   */
  warnDeployFunctionSkipsEnvironment() {
    if (!this.validated) return
    if (this.isDevMode()) return
    if (this._deployFunctionEnvWarned) return
    const target = this.options.function
    if (!this.validated.servers.some((server) => server.name === target)) return
    const environment =
      this.serverless.service.functions[target]?.environment ?? {}
    const hasIntrinsic = Object.values(environment).some(
      (value) =>
        value !== null &&
        (typeof value === 'object' || typeof value === 'function'),
    )
    if (!hasIntrinsic) return
    this._deployFunctionEnvWarned = true
    log.warning(
      `Environment variables are not updated by "deploy function" for the MCP server "${target}": one of its environment values is a CloudFormation reference - which is how "state: true" passes the state key - and the Lambda configuration update skips the whole environment when it sees one, so the deployed environment stays as it is. Run a full "serverless deploy" to apply environment changes.`,
    )
  }

  /**
   * Remove the staged entry - but only when this run is the one that staged it.
   *
   * The cleanup hooks fire on every command an mcp service runs, and most of them
   * (`info`, `remove`, `print`) never stage anything. `serverless-mcp/entry.mjs`
   * is a plain, non-dot path a service is free to have authored itself, so
   * deleting it on the strength of the name alone would cost a user their file on
   * a command that wrote nothing at all.
   */
  async unstageEntry() {
    if (!this.validated) return
    if (this.isDevMode()) return
    if (!this._entryStaged) return
    this._entryStaged = false
    await unstageEntry({ serviceDir: this.serviceDir() })
  }

  /**
   * Point every server function at the staged entry, and the entry at the file
   * the artifact actually contains.
   *
   * `onlyFunction` restricts the work to the `deploy function` target.
   */
  async repointFunctions(onlyFunction) {
    if (!this.validated) return
    if (this.isDevMode()) {
      this.warnDevModeUnsupported()
      return
    }
    const { bundled, outputExtension } = await this.esbuildBuildState()
    const baseUrl = publicBaseUrl(this.serverless.service.provider)
    const unbundledServers = []
    for (const server of this.validated.servers) {
      if (onlyFunction !== undefined && server.name !== onlyFunction) continue
      const functionObject = this.serverless.service.functions[server.name]
      const isBundled = bundled.has(server.name)
      if (!isBundled) unbundledServers.push(server.name)
      // Already swapped, by an earlier pass over this same service model. Doing
      // it again would derive the module path below from the entry handler this
      // pass installed, pointing the entry at itself.
      if (functionObject.handler === mcpEntryHandler) continue
      // Authoritative: the entry's own probe for a sibling of the configured
      // path is legacy defense behind this value, not the mechanism.
      functionObject.environment.SERVERLESS_MCP_SERVER_MODULE =
        artifactModulePath({
          sourcePath: server.server,
          handler: functionObject.handler,
          outputExtension: isBundled ? outputExtension : undefined,
        })
      // Set only for a custom domain, and then it is absolute: the entry stops
      // deriving the resource identifier from the request. That couples the two
      // - a client reaching the same server through the raw execute-api URL is
      // told to authenticate against the custom-domain resource and rejects the
      // mismatch. Serving one public URL is the point of configuring a domain;
      // `provider.apiGateway.disableDefaultEndpoint` is how a service closes
      // the other door, and it stays the user's decision.
      //
      // A value the user put in this server's own `environment` wins: the
      // derived one is a convenience for the common case, and overwriting it
      // would make the documented override unusable (a service fronted by two
      // REST domains, or one behind CloudFront, has to name its own URL).
      if (
        baseUrl !== undefined &&
        !('SERVERLESS_MCP_PUBLIC_BASE_URL' in functionObject.environment)
      ) {
        functionObject.environment.SERVERLESS_MCP_PUBLIC_BASE_URL = baseUrl
      }
      functionObject.handler = mcpEntryHandler
    }
    if (unbundledServers.length === 0) return
    // Mixed: the bundler's file list is the artifact, and it does not carry the
    // servers it did not build. Any bundled function is enough for that, MCP
    // server or not - `_package` hands the whole build set to `_packageAll`,
    // which sets the SERVICE-level `package.artifact` (`../../esbuild/index.js`),
    // so a single `.ts` handler of the user's own strands every unbundled
    // server. Under `package.individually` the bundler zips per function and
    // sets per-function artifacts instead, leaving an unbundled server to the
    // classic packager, which does carry its file.
    if (
      bundled.size > 0 &&
      this.serverless.service.package?.individually !== true
    ) {
      warnPartiallyBundledServers(unbundledServers)
    }
    await warnStrippedDevDependencies({
      serviceDir: this.serviceDir(),
      servicePackage: this.serverless.service.package ?? {},
    })
  }

  /**
   * Which server functions the esbuild plugin bundled, and the extension it
   * emitted them with.
   *
   * Both reads are of the plugin's own memoized state, computed by its build
   * hook earlier in this same command - which matters: computing
   * `functions()` here instead would freeze the build set against the handlers
   * this method is about to rewrite. `_outputExtension` is asked rather than
   * reimplemented because it is what decides the emitted file name, including
   * the `outExtension` override and its format cross-checks.
   *
   * The plugin is located by those two members rather than by name, matching how
   * the api-gateway compiler is found above; without it (a bundler plugin
   * replaced, a stripped plugin list) nothing is bundled and the configured
   * source paths stand, which is the classic-mode answer.
   */
  async esbuildBuildState() {
    const esbuildPlugin = this.serverless.pluginManager.plugins.find(
      (plugin) =>
        typeof plugin._outputExtension === 'function' &&
        typeof plugin.functions === 'function',
    )
    const bundled = esbuildPlugin
      ? new Set(Object.keys(await esbuildPlugin.functions()))
      : new Set()
    // `_outputExtension` validates as well as maps, and throws on a combination
    // esbuild refuses to emit - so it is only asked when something was actually
    // bundled. A service that bundles nothing must not start failing here over a
    // build property that never reached esbuild.
    if (bundled.size === 0) return { bundled, outputExtension: undefined }
    return {
      bundled,
      outputExtension: esbuildPlugin._outputExtension(
        await esbuildPlugin._buildProperties(),
      ),
    }
  }

  /**
   * Surface the public URL of every MCP server as an `mcp` service-output
   * section.
   *
   * Going through `addServiceOutputSection` rather than writing text directly is
   * what puts the lines where the rest of the summary is - below `Service
   * deployed to stack` on deploy - and keeps `info --json` a single JSON
   * document, since the info plugin's `--json` branch never renders sections.
   *
   * The URL is only knowable from the deployed stack, whose outputs the info
   * plugin has already fetched into its `gatheredData` by the time these hooks
   * run - so they are read from the loaded plugin instance rather than paid for
   * with a second `describeStacks` call. Nothing is registered when no plugin
   * gathered them (a stack that does not exist yet, a failed lookup), matching
   * how the info plugin skips its own output sections.
   *
   * The `_serviceOutputsAdded` guard keeps this idempotent, because
   * `addServiceOutputSection` throws on a duplicate section name.
   */
  addMcpServiceOutputs() {
    if (!this.validated) return
    if (this._serviceOutputsAdded) return
    if (typeof this.serverless.addServiceOutputSection !== 'function') return
    const outputs = this.serverless.pluginManager.plugins.find((plugin) =>
      Array.isArray(plugin.gatheredData?.outputs),
    )?.gatheredData.outputs
    const lines = formatMcpEndpoints({
      servers: this.validated.servers,
      serviceEndpoint: serviceEndpointOf(outputs),
      // The same derivation the entry is handed as
      // SERVERLESS_MCP_PUBLIC_BASE_URL, so the printed URL and the one the
      // deployed server advertises cannot disagree.
      publicBaseUrl: publicBaseUrl(this.serverless.service.provider),
    })
    if (lines.length === 0) {
      log.debug(
        'mcp: no custom domain is configured and no "ServiceEndpoint" stack output was gathered, skipping the endpoint summary',
      )
      return
    }
    // The section renderer prints an array as an indented block under the
    // section header and a string inline, so a lone server is handed over as a
    // bare string to keep it a `mcp: crm → …` one-liner - the same
    // `endpoints`/`endpoint` special-case the info plugin makes.
    this.serverless.addServiceOutputSection(
      'mcp',
      lines.length === 1 ? lines[0] : lines,
    )
    this._serviceOutputsAdded = true
  }

  /**
   * Point every state-enabled server's function at its key and grant the
   * execution role read access.
   *
   * Both consumers run before `package:compileEvents`, where the secret itself
   * is emitted: `compileFunctions` freezes function environments and
   * `mergeIamTemplates` (`package:setupProviderConfiguration`) consumes
   * `provider.iam.role.statements`. The `{Ref}` is stable because the secret's
   * logical ID derives from the server name alone.
   */
  applyStateKeyReferences() {
    const refs = stateKeyRefs({
      servers: this.validated.servers,
      naming: this.provider.naming,
    })
    const refEntries = Object.entries(refs)
    for (const [name, { keyRef }] of refEntries) {
      // CloudFormation accepts both a literal ARN string (BYO) and a {Ref}
      // intrinsic as an environment variable value.
      this.serverless.service.functions[
        name
      ].environment.SERVERLESS_MCP_STATE_KEY_REF = keyRef
    }
    if (!refEntries.length) return
    const provider = this.serverless.service.provider
    // Under `iam.role.mode: perFunction`, `rolesPerFunction` defaults every
    // generated role to inheriting `provider.iam.role.statements`, so a
    // provider-level grant would hand every function in the service every
    // server's state key. Attach each grant to its own function instead, via
    // the same `iam.role.statements` shape that mode reads per function.
    //
    // This is checked ahead of the bring-your-own-role check below because
    // `rolesPerFunction` still builds a role per function under the legacy
    // `provider.role` spelling while per-function mode is on (it early-returns
    // for `provider.role` only when the mode is off) - so skipping this branch
    // for BYO would deploy that combination with no read grant at all, and the
    // server would fail at runtime with AccessDenied. Writing here is safe in
    // every BYO combination: the statements land on the synthesized functions'
    // own `iam.role.statements` and never on user IAM, so where
    // `rolesPerFunction` does early-return entirely (an existing role ARN under
    // `iam.role`) they are simply inert.
    if (provider.iam?.role?.mode === 'perFunction') {
      for (const [name, { keyRef }] of refEntries) {
        const functionObject = this.serverless.service.functions[name]
        const functionIam = (functionObject.iam = functionObject.iam || {})
        functionIam.role = functionIam.role || {}
        functionIam.role.statements = (
          functionIam.role.statements ?? []
        ).concat(stateIamStatement(keyRef))
      }
      return
    }
    // A bring-your-own execution role gets nothing - `mergeIamTemplates` skips
    // statement merging entirely for both spellings, so the runtime teaching
    // error and `checkStateKeyGrants` own that case.
    if (
      'role' in provider ||
      this.provider.isExistingRoleProvided(provider.iam?.role)
    ) {
      return
    }
    const statements = stateIamStatements(refs)
    const iam = (provider.iam = provider.iam || {})
    iam.role = iam.role || {}
    // Both consumers read the legacy `provider.iamRoleStatements` only while
    // the modern shape is absent (`mergeIamTemplates` falls back on
    // `else if`, `rolesPerFunction` branches on `provider.iam` truthiness), so
    // creating `iam.role.statements` here would silently drop the service's own
    // grants. Fold them in - without mutating the legacy array itself.
    iam.role.statements = (
      iam.role.statements ??
      provider.iamRoleStatements ??
      []
    ).concat(statements)
  }

  /**
   * Warn when the execution role the user brought cannot read a state key.
   *
   * One hook, after the deploy, rather than a check before it and a check after:
   * what is guarded against fails at the server's cold start and nowhere
   * earlier, so immediately post-deploy is never too late - and by then the
   * provisioned secret always exists, which is what makes its ARN knowable at
   * all. A pre-deploy pass would have to skip the whole first deploy of a
   * `state: true` server, when the key it would check has not been created yet.
   *
   * Everything the check needs is resolved here and the work itself is pure:
   * which role, if any, is the user's to grant on, and how to talk to AWS.
   */
  async checkStateKeyGrants() {
    if (!this.validated) return
    const roleArn = byoRoleArnFor({
      provider: this.serverless.service.provider,
      isExistingRoleProvided: (role) =>
        this.provider.isExistingRoleProvided(role),
    })
    if (roleArn === undefined) return
    await warnMissingStateGrants({
      servers: this.validated.servers,
      roleArn,
      stackName: this.provider.naming.getStackName(),
      naming: this.provider.naming,
      request: (...args) => this.provider.request(...args),
    })
  }

  /**
   * Resolve the top-level `mcp` configuration.
   *
   * `lib/classes/service.js` copies only a fixed set of top-level keys from
   * `configurationInput` onto the service model, so custom top-level
   * properties such as `mcp` live on `configurationInput`. `service.mcp` is
   * still consulted first, matching how the `ai` and `sandboxes` plugins read
   * their own top-level blocks (and allowing plugins to populate it).
   */
  getMcpConfig() {
    return (
      this.serverless.service.mcp || this.serverless.configurationInput?.mcp
    )
  }
}

export default AwsMcp
