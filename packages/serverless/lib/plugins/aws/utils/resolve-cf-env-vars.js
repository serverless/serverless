import { log } from '@serverless/util'
import resolveCfRefValue from './resolve-cf-ref-value.js'
import resolveCfImportValue from './resolve-cf-import-value.js'

/**
 * Resolves CloudFormation intrinsic functions in environment variables.
 *
 * Handles `Ref`, `Fn::ImportValue`, and `Fn::GetAtt` intrinsics that appear
 * as object values in environment variable maps (e.g. from serverless.yml).
 *
 * - `Ref` and `Fn::ImportValue` are resolved via AWS API calls (listStackResources / listExports).
 * - `Fn::GetAtt` is resolved from the deployed stack's Outputs (since there is no AWS API
 *   to resolve arbitrary GetAtt values; they must be declared as stack Outputs).
 * - Unresolvable values are removed and a warning is logged (to avoid `[object Object]` leaking
 *   into container environment variables).
 *
 * @param {Object} provider - The Serverless AWS provider instance (used for API calls)
 * @param {Object} envVars - Environment variables map (mutated in place)
 * @param {Array} [stackOutputs=[]] - The Outputs array from describeStacks, used for Fn::GetAtt
 * @returns {Promise<Object>} The mutated envVars object
 */
async function resolveCfEnvVars(provider, envVars, stackOutputs = []) {
  const outputMap = Object.fromEntries(
    stackOutputs.map((o) => [o.OutputKey, o.OutputValue]),
  )

  await Promise.all(
    Object.entries(envVars).map(async ([envKey, envValue]) => {
      if (typeof envValue !== 'object' || envValue === null) return

      try {
        if (envValue.Ref) {
          envVars[envKey] = await resolveCfRefValue(provider, envValue.Ref)
        } else if (envValue['Fn::ImportValue']) {
          const importName = envValue['Fn::ImportValue']
          if (typeof importName === 'string') {
            envVars[envKey] = await resolveCfImportValue(provider, importName)
          } else {
            throw new Error(
              `Fn::ImportValue must be a string, got ${typeof importName}`,
            )
          }
        } else if (envValue['Fn::GetAtt']) {
          const getAttValue = envValue['Fn::GetAtt']
          const [logicalId, attr] =
            typeof getAttValue === 'string'
              ? getAttValue.split('.')
              : getAttValue
          let resolved = null

          for (const [outputKey, outputValue] of Object.entries(outputMap)) {
            if (!outputKey.startsWith(logicalId)) continue
            const suffix = outputKey.slice(logicalId.length)
            if (suffix && attr.endsWith(suffix)) {
              resolved = outputValue
              break
            }
          }

          if (resolved !== null) {
            envVars[envKey] = resolved
          } else {
            throw new Error(
              `Fn::GetAtt [${logicalId}, ${attr}] was not found in stack outputs`,
            )
          }
        } else {
          throw new Error(`Unsupported intrinsic: ${JSON.stringify(envValue)}`)
        }
      } catch (error) {
        log.warning(
          `Could not resolve CloudFormation reference for environment variable '${envKey}': ${error.message}`,
        )
        // Remove unresolvable intrinsics to avoid [object Object] in the container
        delete envVars[envKey]
      }
    }),
  )

  return envVars
}

export default resolveCfEnvVars
