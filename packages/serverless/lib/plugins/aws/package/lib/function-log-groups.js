import { LOG_GROUP_CLASSES } from '../../lib/naming.js'

/**
 * Build the CloudFormation log group resources for a Lambda function.
 *
 * Returns a map of `{ [logicalId]: resource }` ready to merge into the
 * compiled CloudFormation template. May return:
 *  - an empty object — when the function disables logs or when a custom log
 *    group name is supplied at function or provider level (the user owns it)
 *  - a single standard log group — the default
 *  - the standard log group plus an Infrequent Access sibling — when the
 *    function's effective log group class is `INFREQUENT_ACCESS`. The
 *    standard group is still emitted so any pre-existing history at that
 *    name is preserved across the migration; the IA group carries
 *    `DeletionPolicy: Retain` so its data survives a stack removal.
 *
 * @param {object} params
 * @param {string} params.functionName - The key in the `functions:` block.
 * @param {object} params.functionObject - The resolved function configuration.
 * @param {object} params.awsProvider - The AWS provider instance (used for
 *   `naming`, `getLogRetentionInDays`, `getLogDataProtectionPolicy`,
 *   `getLogGroupClass`).
 * @param {object} params.serviceProvider - `serverless.service.provider` —
 *   used to detect a service-wide custom log group name.
 * @returns {Record<string, object>}
 */
export default function buildFunctionLogGroupResources({
  functionName,
  functionObject,
  awsProvider,
  serviceProvider,
}) {
  if (functionObject.disableLogs) return {}
  if (functionObject.logs?.logGroup || serviceProvider.logs?.lambda?.logGroup) {
    return {}
  }

  const logRetentionInDays =
    functionObject.logRetentionInDays || awsProvider.getLogRetentionInDays()
  const logDataProtectionPolicy =
    functionObject.logDataProtectionPolicy ||
    awsProvider.getLogDataProtectionPolicy()

  const buildResource = ({ logGroupClass } = {}) => {
    const logicalId = awsProvider.naming.getLogGroupLogicalId(functionName, {
      logGroupClass,
    })
    const resource = {
      Type: 'AWS::Logs::LogGroup',
      Properties: {
        LogGroupName: awsProvider.naming.getLogGroupName(functionObject.name, {
          logGroupClass,
        }),
      },
    }

    if (logGroupClass === LOG_GROUP_CLASSES.INFREQUENT_ACCESS) {
      resource.Properties.LogGroupClass = LOG_GROUP_CLASSES.INFREQUENT_ACCESS
      resource.DeletionPolicy = 'Retain'
    }

    if (logRetentionInDays) {
      resource.Properties.RetentionInDays = logRetentionInDays
    }

    if (logDataProtectionPolicy) {
      resource.Properties.DataProtectionPolicy = logDataProtectionPolicy
    }

    return { [logicalId]: resource }
  }

  const resources = buildResource()

  const effectiveLogGroupClass = awsProvider.getLogGroupClass(functionObject)
  if (effectiveLogGroupClass === LOG_GROUP_CLASSES.INFREQUENT_ACCESS) {
    Object.assign(
      resources,
      buildResource({ logGroupClass: LOG_GROUP_CLASSES.INFREQUENT_ACCESS }),
    )
  }

  return resources
}
