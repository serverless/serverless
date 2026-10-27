import naming from '../lib/naming.js'

/**
 * The name of the alias a deploy publishes for a function and points its event sources at, by
 * the rule the compiler applies (`compile/functions.js`): `snapstart` for SnapStart, the
 * provisioned-concurrency alias for provisioned concurrency, `durable` for `durableConfig`. Lets
 * commands that do not package (such as `invoke`) target the same alias.
 *
 * @param {object} functionObject - the function as configured in `serverless.yml`
 * @returns {string|undefined} the alias name, or undefined when the function publishes none
 */
const targetAliasName = (functionObject) => {
  if (functionObject.snapStart) {
    return naming.getLambdaSnapStartEnabledAliasName()
  }
  if (functionObject.provisionedConcurrency) {
    return (
      functionObject.provisionedConcurrency.alias ||
      naming.getLambdaProvisionedConcurrencyAliasName()
    )
  }
  if (functionObject.durableConfig) {
    return naming.getLambdaDurableEnabledAliasName()
  }
  return undefined
}

export default targetAliasName
