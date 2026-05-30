import {
  allSqsQueues,
  allSnsTopics,
  allS3Buckets,
  allEventResources,
} from './registry.js'

/**
 * Formats the provisioned resources in the registry into grouped summary lines
 * for the startup banner. Each provisioned resource is shown as
 * `<logicalId>  →  <local url|arn>` under a per-type heading. Empty groups are
 * omitted. Lambda function identities are intentionally excluded — they are an
 * internal resolution aid, not user-declared resources.
 *
 * @param {{
 *   sqs: Map<string, object>,
 *   sns: Map<string, object>,
 *   s3: Map<string, object>,
 *   events: Map<string, object>,
 * }} registry - The populated resource registry.
 * @returns {string[]} The summary lines (empty when nothing was provisioned).
 */
export function formatProvisionedResources(registry) {
  const groups = [
    ['Queues', allSqsQueues(registry), (r) => r.url],
    ['Topics', allSnsTopics(registry), (r) => r.arn],
    ['Buckets', allS3Buckets(registry), (r) => r.arn],
    ['Event buses/rules', allEventResources(registry), (r) => r.arn],
  ]

  const lines = []
  for (const [label, records, format] of groups) {
    const list = [...records]
    if (list.length === 0) continue
    lines.push(`${label}:`)
    for (const record of list) {
      lines.push(`  ${record.logicalId}  →  ${format(record)}`)
    }
  }
  return lines
}
