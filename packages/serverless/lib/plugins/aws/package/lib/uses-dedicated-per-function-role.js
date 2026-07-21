import _ from 'lodash'

const EXTERNAL_PLUGIN_NAME = 'serverless-iam-roles-per-function'

// Extracted from roles-per-function.js so prediction (compile time) and role
// creation (finalize) share one detection.
export function hasExternalIamPerFunctionPlugin(serverless) {
  const pm = serverless && serverless.pluginManager
  const plugins =
    (pm && pm.getPlugins ? pm.getPlugins() : pm && pm.plugins) || []
  return plugins.some(
    (p) =>
      p &&
      p.constructor &&
      (p.constructor._serverlessExternalPluginName === EXTERNAL_PLUGIN_NAME ||
        p.constructor.name === 'ServerlessIamPerFunctionPlugin'),
  )
}

// Predicts, at compile time, whether createRolesPerFunction (finalize) will
// give this function a dedicated role. Must stay in lockstep with
// _createRoleForFunction / createRolesPerFunction early returns.
export default function usesDedicatedPerFunctionRole({
  functionObject,
  serverless,
  awsProvider,
}) {
  if (!functionObject) return false
  if (hasExternalIamPerFunctionPlugin(serverless)) return false
  if (functionObject.role) return false
  const configProvider = serverless.service.provider || {}
  const iamRole = _.get(configProvider, 'iam.role', {})
  if (
    awsProvider.isExistingRoleProvided &&
    awsProvider.isExistingRoleProvided(iamRole)
  ) {
    return false
  }
  const perFunctionMode = _.isObject(iamRole) && iamRole.mode === 'perFunction'
  if ('role' in configProvider && !perFunctionMode) return false
  if (perFunctionMode) return true
  const hasLegacyStatements = functionObject.iamRoleStatements !== undefined
  const hasNewShapeStatements =
    _.get(functionObject, 'iam.role.statements') !== undefined
  const functionManagedPolicies = _.get(
    functionObject,
    'iam.role.managedPolicies',
  )
  const hasFunctionManagedPolicies =
    Array.isArray(functionManagedPolicies) && functionManagedPolicies.length > 0
  return (
    hasLegacyStatements || hasNewShapeStatements || hasFunctionManagedPolicies
  )
}
