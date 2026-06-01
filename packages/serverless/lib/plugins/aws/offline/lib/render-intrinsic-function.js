/**
 * Resolve a minimal subset of CloudFormation intrinsic functions in a value,
 * so that `Fn::Join`/`Fn::Sub` (and their `!Join`/`!Sub` shorthands) declared
 * in a function or provider `environment` map render to plain strings instead
 * of leaking into the handler environment as `[object Object]`.
 *
 * Behavior mirrors serverless-offline:
 * serverless-offline/src/utils/renderIntrinsicFunction.js
 *
 * - `null`/`undefined`/string/number are returned unchanged.
 * - Arrays are mapped element-wise.
 * - For objects, `Fn::Join`/`!Join` (`[delimiter, list]`) collapse to the
 *   joined string and `Fn::Sub`/`!Sub` (`[template, variables]`) collapse to
 *   the substituted template; any other key (`Ref`, `Fn::GetAtt`, unsupported
 *   intrinsics, ...) recurses into its value and is otherwise passed through
 *   unchanged.
 *
 * @param {*} input value to render
 * @returns {*} the rendered value
 */
export function renderIntrinsicFunction(input) {
  if (input === null || input === undefined) {
    return input
  }

  if (typeof input === 'string') {
    return input
  }

  if (Array.isArray(input)) {
    return input.map(renderIntrinsicFunction)
  }

  if (typeof input === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(input)) {
      if (key === 'Fn::Join' || key === '!Join') {
        const [delimiter, list] = value
        return list.map(renderIntrinsicFunction).join(delimiter)
      }
      if (key === 'Fn::Sub' || key === '!Sub') {
        const [template, variables] = value
        result[key] = template.replaceAll(/\${(.*?)}/g, (match, variable) =>
          variable in variables ? variables[variable] : match,
        )
        return result[key]
      }
      result[key] = renderIntrinsicFunction(value)
    }
    return result
  }

  return input
}
