import { z } from 'zod'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { AbstractProvider } from '../index.js'

/**
 * The service name of a `<service>.<Output>` reference key, or `null` when the
 * key has no output part. Split at the LAST dot: a CloudFormation output name
 * never contains a dot, so the service name may (it is the key under
 * `services` in the compose file, used as written). Shared with the compose
 * runner, which applies the same grammar when it orders the deploy.
 *
 * @param {string} key
 * @returns {string|null}
 */
export function serviceNameOf(key) {
  const dot = key.lastIndexOf('.')
  return dot <= 0 || dot === key.length - 1 ? null : key.slice(0, dot)
}

/**
 * Resolves cross-service Compose graph references, e.g. `${service:alias.Output}`
 * (same-stage) and `${shared:alias.Output}` (pinned via a named `type: service`
 * instance).
 *
 * This provider is transport-only: it parses and validates the reference and
 * reads everything it needs through a `composeContext` object injected on the
 * instance at dispatch time (`setComposeContext`). It owns no state-store,
 * registry, or caching logic — fetching outputs is delegated to the injected
 * `getOutputs` callback.
 */
export class Service extends AbstractProvider {
  static type = 'service'
  // Scope marker: this provider type is only available inside a compose-file
  // manager. Everywhere else it is filtered from availability/inheritance and
  // rejected by validation. May grow into a `scope` enum if more scopes appear.
  static composeOnly = true
  static resolvers = ['service']
  static defaultResolver = 'service'

  /**
   * The pinned `stage` of a named instance lives on the provider config passed
   * to the base constructor, which stores it as `this.config`. Expose it under
   * the name the resolver contract reads from.
   */
  get providerConfig() {
    return this.config
  }

  /**
   * Inject the dispatch-time compose wiring. Held on the INSTANCE, never on
   * `this.config`: for a named instance that config object is the
   * `stages.<stage>.resolvers.<name>` block of the compose configuration by
   * reference, so writing there would put callbacks into the user's
   * configuration and break any later serialization of it.
   *
   * @param {Object} composeContext - `{ runStage, aliases, command,
   *   getOutputs(alias, stage), shortCircuitValue(command) }`.
   */
  setComposeContext(composeContext) {
    this.composeContext = composeContext
  }

  static validateConfig(providerConfig) {
    const schema = z
      .object({
        type: z.literal('service'),
        stage: z
          .string({ message: "The 'stage' property must be a string" })
          .optional(),
      })
      .strict({
        message:
          "Only 'type' and 'stage' are allowed in the service resolver configuration",
      })

    try {
      schema.parse(providerConfig)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(error.issues[0].message)
      }
      throw error
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType !== 'service') {
      throw new Error(`Resolver ${resolverType} is not supported`)
    }

    const composeContext = this.composeContext
    if (!composeContext) {
      throw new ServerlessError(
        `Could not resolve the parameter '${key}': service references are supported only in serverless-compose.yml, under 'services.<service>.params'. Move the reference there and read the value in this configuration with '\${param:...}'.`,
        ServerlessErrorCodes.compose.COMPOSE_COULD_NOT_RESOLVE_PARAM,
        { stack: false },
      )
    }

    try {
      return await this.#resolveReference({ key, composeContext })
    } catch (error) {
      // print never fails on an unresolvable reference: it renders the
      // placeholder instead — identical to the `${producer.Output}` dot form.
      // Only the reference's own outcomes qualify (no deployed state, no such
      // output, unknown alias, malformed reference); an operational failure of
      // the read behind it (credentials, network, state store) is not "not
      // available yet" and fails print like any other command — the
      // placeholder would report success with a fabricated value.
      const isReferenceOutcome =
        error instanceof ServerlessError &&
        (error.code ===
          ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND ||
          error.code ===
            ServerlessErrorCodes.compose.COMPOSE_COULD_NOT_RESOLVE_PARAM)
      if (isReferenceOutcome && composeContext.command?.[0] === 'print') {
        return 'NOT_AVAILABLE_IN_PRINT_COMMAND'
      }
      throw error
    }
  }

  async #resolveReference({ key, composeContext }) {
    // `<service>.<Output>`, split at the last dot (see `serviceNameOf`): the
    // service name is whatever the compose file declares under `services`,
    // validated by the known-services check below; the output key is the
    // CloudFormation output name.
    const alias = serviceNameOf(key)
    if (alias === null) {
      throw new ServerlessError(
        `Could not resolve the parameter '${key}': expected a reference of the shape 'alias.OutputKey' (for example 'orders-db.QueueUrl').`,
        ServerlessErrorCodes.compose.COMPOSE_COULD_NOT_RESOLVE_PARAM,
        { stack: false },
      )
    }

    const outputKey = key.slice(alias.length + 1)
    const { runStage, aliases, getOutputs } = composeContext

    if (!aliases.includes(alias)) {
      const availableAliases =
        aliases.length > 0 ? aliases.join(', ') : '(none)'
      throw new ServerlessError(
        `Could not resolve the parameter '${key}': '${alias}' is not a known service. Available services: ${availableAliases}.`,
        ServerlessErrorCodes.compose.COMPOSE_COULD_NOT_RESOLVE_PARAM,
        { stack: false },
      )
    }

    const effectiveStage = this.providerConfig.stage ?? runStage
    const outputs = await getOutputs(alias, effectiveStage)

    // The next two failures mean "there is no value here" — the same outcome
    // `${aws:cf:...}` reports with `null` for an absent stack or output — so a
    // declared fallback applies. They carry the not-found code (with the
    // teaching text, which is what the user sees when no fallback is declared)
    // instead of returning null; everything above is a misuse of the reference
    // itself and stays fatal.
    if (outputs == null) {
      throw new ServerlessError(
        `Could not resolve the parameter '${key}': no deployed state found for service '${alias}'. Deploy it first with 'serverless deploy --service=${alias} --stage ${effectiveStage}', then retry. If it is already deployed, refresh its state with 'serverless ${alias} info --stage ${effectiveStage}'.`,
        ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND,
        { stack: false },
      )
    }

    // Use an explicit undefined check: a resolved output can be an empty string,
    // which must pass through rather than be treated as missing.
    // Own properties only: the outputs come from a plain object, and a key
    // such as `toString` must not resolve to an inherited function.
    const value = Object.hasOwn(outputs, outputKey)
      ? outputs[outputKey]
      : undefined
    if (value === undefined) {
      const availableOutputs = Object.keys(outputs)
      const availableList =
        availableOutputs.length > 0 ? availableOutputs.join(', ') : '(none)'
      throw new ServerlessError(
        `Could not resolve the parameter '${key}': service '${alias}' has no output '${outputKey}'. Available outputs: ${availableList}. Check the output name in your reference.`,
        ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND,
        { stack: false },
      )
    }

    return value
  }
}
