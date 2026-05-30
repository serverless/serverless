/**
 * Re-renders each function's environment and event declarations so intrinsic
 * references (`Ref`, `Fn::GetAtt`, `Fn::Sub`, …) are replaced with the real
 * local values resolved against the provisioned registry.
 *
 * For every function the provider-level environment is merged with the
 * function-level environment (function values win on collision), then the whole
 * map is resolved. The resolver drops keys whose value is unresolvable or
 * `AWS::NoValue`, so missing cross-stack imports simply disappear rather than
 * leaving raw CFN objects in the runtime environment. Event declarations are
 * likewise resolved in place (e.g. an SQS event-source ARN supplied as
 * `Fn::GetAtt` becomes the synthesized queue ARN the poller expects).
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
  const providerEnv = service.provider?.environment ?? {}
  const functions = service.functions ?? {}

  for (const fn of Object.values(functions)) {
    const merged = { ...providerEnv, ...(fn.environment ?? {}) }
    fn.environment = resolveIntrinsics(merged)

    if (Array.isArray(fn.events)) {
      fn.events = fn.events.map((event) => resolveIntrinsics(event))
    }
  }
}
