'use strict'

import { getWebAppLogGroupNames } from './compilers/logGroups.js'
import { getEffectiveKmsKeyArn } from './compilers/revision.js'

/**
 * ARNs of the log groups a web function writes to, for an execution role:
 * the central group in the stack's Region, and the `.local` group in every
 * Region, because each Region that serves the function writes its own. The
 * function wildcard `/aws/lambda/<service>-<stage>*` does not cover them.
 *
 * @param {string} functionName - the web function's name
 * @param {string} [suffix] - appended to both ARNs: `:*` for the log-group
 *   actions, `:*:*` for `logs:PutLogEvents`
 * @returns {{ centralized: object, local: object }} `Fn::Sub` ARNs
 */
export function getWebAppLogGroupArns(functionName, suffix = '') {
  const { logGroupName, localLogGroupName } =
    getWebAppLogGroupNames(functionName)
  return {
    centralized: {
      'Fn::Sub':
        'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
        `:log-group:${logGroupName}${suffix}`,
    },
    local: {
      'Fn::Sub':
        'arn:${AWS::Partition}:logs:*:${AWS::AccountId}' +
        `:log-group:${localLogGroupName}${suffix}`,
    },
  }
}

/**
 * Grant a web function's log groups in an execution role's first two
 * statements, the shape of `iam-role-lambda-execution-template.json`:
 * statement 0 holds the log-group actions, statement 1 `logs:PutLogEvents`.
 *
 * @param {object[]} statements - the role policy's statements, mutated
 * @param {string} functionName - the web function's name
 */
export function grantWebAppLogGroups(statements, functionName) {
  statements[0].Resource.push(
    ...Object.values(getWebAppLogGroupArns(functionName, ':*')),
  )
  statements[1].Resource.push(
    ...Object.values(getWebAppLogGroupArns(functionName, ':*:*')),
  )
}

/**
 * The `kms:Decrypt` statement a web app's execution role needs for the key
 * that encrypts its environment (the entry's `kmsKeyArn`, else
 * `provider.kmsKeyArn`). As for functions, only a literal ARN is granted.
 *
 * @param {object} webApp
 * @param {object} providerConfig - `serverless.service.provider`
 * @returns {object|undefined}
 */
export function getWebAppKmsStatement(webApp, providerConfig) {
  const kmsKeyArn = getEffectiveKmsKeyArn(webApp, providerConfig)
  if (typeof kmsKeyArn !== 'string') return undefined
  return { Effect: 'Allow', Action: ['kms:Decrypt'], Resource: [kmsKeyArn] }
}
