/**
 * Re-renders each function's environment, event, and destination declarations
 * so intrinsic references (`Ref`, `Fn::GetAtt`, `Fn::Sub`, …) are replaced with
 * the real local values resolved against the provisioned registry.
 *
 * The provider-level environment is resolved in place first, so its keys are
 * the real local values and any unresolvable or `AWS::NoValue` keys are
 * dropped. This matters because the invoke path re-merges the raw
 * `provider.environment`; leaving an unresolved intrinsic (e.g. a missing
 * cross-stack `Fn::ImportValue`) there would let it reach the handler as a raw
 * CFN object. For every function the now-resolved provider-level environment is
 * merged with the function-level environment (function values win on
 * collision), then the whole map is resolved. The resolver drops keys whose
 * value is unresolvable or `AWS::NoValue`, so missing cross-stack imports
 * simply disappear rather than leaving raw CFN objects in the runtime
 * environment. Event declarations are likewise resolved in place (e.g. an SQS
 * event-source ARN supplied as `Fn::GetAtt` becomes the synthesized queue ARN
 * the poller expects), as are async-invocation destinations (e.g. an
 * `onFailure` ARN supplied as `Fn::GetAtt` becomes the synthesized ARN the
 * destination router expects).
 *
 * The host `process.env` is never touched — only the in-memory service model.
 *
 * @param {object} serverless - The Serverless instance.
 * @param {{ resolveIntrinsics: (value: unknown) => unknown }} context
 *   The bound resolver helper.
 * @returns {void}
 */
export function rerenderFunctionEnvironments(
  serverless,
  { resolveIntrinsics },
) {
  const service = serverless.service ?? {}
  const provider = service.provider ?? {}
  const functions = service.functions ?? {}

  // Resolve the provider-level environment in place first so the invoke path,
  // which re-merges this raw object, never sees unresolved intrinsics. The
  // resolver drops unresolvable / AWS::NoValue keys.
  provider.environment = resolveIntrinsics(provider.environment ?? {})
  const providerEnv = provider.environment

  for (const fn of Object.values(functions)) {
    const merged = { ...providerEnv, ...(fn.environment ?? {}) }
    fn.environment = resolveIntrinsics(merged)

    if (Array.isArray(fn.events)) {
      fn.events = fn.events.map((event) => resolveIntrinsics(event))
    }

    // Resolve async-invocation destinations in place so a destination given as
    // `{ arn: !GetAtt Dlq.Arn }` reaches the destination router as a resolved
    // string arn. The resolver drops keys whose value is unresolvable (e.g. an
    // unresolved cross-stack destination), warning rather than leaking a raw
    // CFN object downstream.
    if (fn.destinations != null) {
      fn.destinations = resolveIntrinsics(fn.destinations)
    }
  }
}
