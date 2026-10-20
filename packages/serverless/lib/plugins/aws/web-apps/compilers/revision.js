'use strict'

import { getWebAppRuntime } from '../runtime.js'
import { resolveLogLevels } from '../../lib/log-levels.js'
import {
  DEFAULT_EXECUTION_ROLE_LOGICAL_ID,
  resolveExecutionRoleRef,
} from '../../lib/execution-role.js'

/** The request timeout Lambda applies when a revision sets none. */
const AWS_DEFAULT_TIMEOUT = 30

/**
 * The timeout the configuration sets for a web app: the entry's `timeout`,
 * else `provider.timeout` as the user wrote it (the Framework's 6-second
 * fallback applies to functions only), else none. An intrinsic (an inherited
 * `provider.timeout` only: the entry's must be a number) passes through; a
 * value that is not a number counts as none.
 *
 * @param {object} webApp
 * @param {object} providerConfig - `serverless.service.provider`
 * @returns {number|object|undefined}
 */
function getConfiguredTimeout(webApp, providerConfig) {
  const timeout = webApp.timeout ?? providerConfig?.timeout
  if (timeout == null) return undefined
  if (typeof timeout === 'object') return timeout
  const seconds = Number(timeout)
  return Number.isNaN(seconds) ? undefined : seconds
}

/**
 * The timeout a web app runs with, as far as it is known before deploy: the
 * configured number, else Lambda's default of 30 seconds (also for an
 * intrinsic, whose value only CloudFormation knows).
 *
 * @param {object} webApp
 * @param {object} providerConfig - `serverless.service.provider`
 * @returns {number}
 */
export function getEffectiveTimeout(webApp, providerConfig) {
  const timeout = getConfiguredTimeout(webApp, providerConfig)
  return typeof timeout === 'number' ? timeout : AWS_DEFAULT_TIMEOUT
}

/**
 * The KMS key that encrypts a web app's environment: the entry's `kmsKeyArn`,
 * else `provider.kmsKeyArn`.
 *
 * @param {object} webApp
 * @param {object} providerConfig - `serverless.service.provider`
 * @returns {string|object|undefined}
 */
export function getEffectiveKmsKeyArn(webApp, providerConfig) {
  return webApp.kmsKeyArn ?? providerConfig.kmsKeyArn
}

/**
 * `LoggingConfig`: each level from the web app's `logs`, else from
 * `provider.logs.lambda`, as for functions, upper-cased. A web function always
 * logs JSON, so the levels apply whatever `provider.logs.lambda.logFormat`
 * says. Unset levels are left out so Lambda's defaults apply.
 *
 * @param {object} [logs] - the web app's `logs`
 * @param {object} [providerLambdaLogs] - `provider.logs.lambda`
 */
function compileLoggingConfig(logs, providerLambdaLogs) {
  const { applicationLogLevel, systemLogLevel } = resolveLogLevels(
    logs,
    providerLambdaLogs,
  )
  const config = {}
  if (applicationLogLevel) config.ApplicationLogLevel = applicationLogLevel
  if (systemLogLevel) config.SystemLogLevel = systemLogLevel
  return Object.keys(config).length > 0 ? config : undefined
}

/**
 * Point a compiled revision at a role in the stack in place of the generated
 * shared role (`iam.role.mode: perFunction`), and make it depend on that role.
 *
 * @param {object} revision - from `compileRevision`, mutated
 * @param {string} roleLogicalId
 */
export function setRevisionExecutionRole(revision, roleLogicalId) {
  const role = resolveExecutionRoleRef(roleLogicalId)
  revision.Properties.ServiceConfig.ExecutionRoleArn = role.arn
  // The generated role is never a dependency, so there is none to replace.
  revision.DependsOn = [...revision.DependsOn, role.dependsOn]
}

/**
 * `AWS::Lambda::WebFunctionRevision`: the code, runtime and settings of one
 * deploy. Every property is create-only, so any change replaces the revision.
 *
 * @param {object} params
 * @param {string} params.functionName
 * @param {object} params.webApp
 * @param {ReturnType<import('./function.js').getWebAppLogicalIds>} params.logicalIds
 * @param {{ key: string, entrypoint: string }} params.artifact - S3 key and the
 *   file the runtime starts (`AWS_LAMBDA_NODEJS_ENTRYPOINT`)
 * @param {string|object} params.bucketRef - from `resolveBucketRef`
 * @param {object} params.provider - the AWS provider
 * @param {object} params.providerConfig - `serverless.service.provider`
 * @param {string} [params.egressConnectorLogicalId] - the network connector
 *   the revision sends VPC traffic through, if any
 * @param {string} [params.bucketPolicyLogicalId] - the in-stack deployment
 *   bucket's policy that grants Lambda read access to the code, if any
 */
export function compileRevision({
  functionName,
  webApp,
  logicalIds,
  artifact,
  bucketRef,
  provider,
  providerConfig,
  egressConnectorLogicalId,
  bucketPolicyLogicalId,
}) {
  // Resolved as for functions: the entry's `role`, else an existing
  // `provider.iam.role`, else the generated role.
  const role = resolveExecutionRoleRef(
    provider.getCustomExecutionRole(webApp) ||
      DEFAULT_EXECUTION_ROLE_LOGICAL_ID,
  )

  const serviceConfig = { ExecutionRoleArn: role.arn }
  const timeout = getConfiguredTimeout(webApp, providerConfig)
  if (timeout !== undefined) serviceConfig.TimeoutSeconds = timeout
  if (webApp.maxConcurrency !== undefined) {
    serviceConfig.MaxConcurrencyPerEnvironment = Number(webApp.maxConcurrency)
  }
  // The entrypoint goes last: a provider-level value must not bypass the
  // bootstrap (an entry-level one is rejected at validation).
  serviceConfig.EnvironmentVariables = {
    ...providerConfig.environment,
    ...webApp.environment,
    AWS_LAMBDA_NODEJS_ENTRYPOINT: artifact.entrypoint,
  }
  if (egressConnectorLogicalId) {
    // The revision takes a versioned connector ARN; a connector change makes a
    // new version, which replaces the revision.
    serviceConfig.EgressNetworkConnectorArn = {
      'Fn::GetAtt': [egressConnectorLogicalId, 'LatestVersionArn'],
    }
  }
  const loggingConfig = compileLoggingConfig(
    webApp.logs,
    providerConfig?.logs?.lambda,
  )
  if (loggingConfig) {
    serviceConfig.TelemetryConfig = { LoggingConfig: loggingConfig }
  }

  const properties = { FunctionName: functionName }
  if (webApp.description !== undefined) {
    properties.Description = webApp.description
  }
  const kmsKeyArn = getEffectiveKmsKeyArn(webApp, providerConfig)
  if (kmsKeyArn) properties.KmsKeyArn = kmsKeyArn
  properties.BuildConfig = {
    // No VersionId: the key names its content, and an unpinned revision keeps
    // the object version current when it was created.
    CodeConfig: { S3Object: { Bucket: bucketRef, Key: artifact.key } },
    RuntimeConfig: {
      Runtime: getWebAppRuntime(webApp, providerConfig.runtime),
    },
  }
  properties.ServiceConfig = serviceConfig

  return {
    Type: 'AWS::Lambda::WebFunctionRevision',
    DependsOn: [
      logicalIds.webFunction,
      ...(role.dependsOn ? [role.dependsOn] : []),
      ...(egressConnectorLogicalId ? [egressConnectorLogicalId] : []),
      ...(bucketPolicyLogicalId ? [bucketPolicyLogicalId] : []),
    ],
    Properties: properties,
  }
}
