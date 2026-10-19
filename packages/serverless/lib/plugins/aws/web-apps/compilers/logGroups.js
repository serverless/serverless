'use strict'

/**
 * The log groups Lambda writes a web function's logs to: the central group
 * in the home Region and the `.local` group in each Region that serves it.
 *
 * @param {string} functionName
 */
export function getWebAppLogGroupNames(functionName) {
  const logGroupName = `/aws/lambda/web/${functionName}`
  return { logGroupName, localLogGroupName: `${logGroupName}.local` }
}

/**
 * Both `AWS::Logs::LogGroup` resources, created by the stack so they get a
 * retention period (Lambda would create them without one): the entry's
 * `logRetentionInDays`, else `provider.logRetentionInDays`; and the data
 * protection policy, the entry's `logDataProtectionPolicy`, else
 * `provider.logDataProtectionPolicy`, as for a function's log group. The
 * function log group helper is keyed to `/aws/lambda/<name>` and
 * function-only options, so these are built here.
 *
 * @param {object} params
 * @param {string} params.functionName
 * @param {object} params.webApp
 * @param {object} params.provider - the AWS provider
 * @returns {{ logGroup: object, localLogGroup: object }}
 */
export function compileLogGroups({ functionName, webApp, provider }) {
  const retentionInDays =
    webApp.logRetentionInDays ?? provider.getLogRetentionInDays()
  const dataProtectionPolicy =
    webApp.logDataProtectionPolicy || provider.getLogDataProtectionPolicy()
  const logGroup = (LogGroupName) => ({
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName,
      ...(retentionInDays ? { RetentionInDays: retentionInDays } : {}),
      ...(dataProtectionPolicy
        ? { DataProtectionPolicy: dataProtectionPolicy }
        : {}),
    },
  })
  const { logGroupName, localLogGroupName } =
    getWebAppLogGroupNames(functionName)
  return {
    logGroup: logGroup(logGroupName),
    localLogGroup: logGroup(localLogGroupName),
  }
}
