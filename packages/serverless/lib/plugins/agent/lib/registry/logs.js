// Registry entry for the `logs` AWS service (CloudWatch Logs).

const logsLogGroupEntry = {
  cfnType: 'AWS::Logs::LogGroup',
  awsService: 'logs',
  category: 'observability',
  engineClient: 'logs',
  // PhysicalResourceId is the log group name as-is (e.g.
  // /aws/lambda/my-service-dev-createOrder).
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    // KNOWN LIMITATION: neither DescribeLogGroups nor ListLogGroups (checked
    // against @aws-sdk/client-cloudwatch-logs's models at this repo's pinned
    // SDK version) offers a single-log-group EXACT lookup -- the closest is
    // `logGroupNamePrefix` (matched here) or `logGroupNamePattern` (which
    // supports `^`-anchored prefixes/substrings, not exact identity either).
    // A log group whose name is itself a prefix of a sibling's name (e.g.
    // `/aws/lambda/foo` and `/aws/lambda/foo-bar`) will have BOTH returned
    // here; the runner has no per-entry post-filter step to narrow this down
    // to the exact match, so this is accepted as best-effort for v1 (the
    // extra sibling(s), if any, are visible in the raw output rather than
    // hidden). Revisit if/when the SDK adds an exact-match describe.
    {
      key: 'logGroups',
      method: 'DescribeLogGroups',
      params: (identifier) => ({ logGroupNamePrefix: identifier }),
    },
    {
      key: 'subscriptionFilters',
      method: 'DescribeSubscriptionFilters',
      input: 'logGroupName',
      paginate: true,
    },
    {
      key: 'metricFilters',
      method: 'DescribeMetricFilters',
      input: 'logGroupName',
      paginate: true,
    },
    {
      key: 'tags',
      // ListTagsLogGroup (not the generic ARN-based ListTagsForResource) is
      // the log-group-specific tagging call -- it takes logGroupName
      // directly, matching this entry's identifier, with no ARN assembly
      // needed. (ListTagsForResource is documented as the newer generic
      // replacement but wants a full log-group ARN, which the identifier
      // here doesn't carry -- ListTagsLogGroup is not deprecated for this
      // purpose and is simpler.)
      method: 'ListTagsLogGroup',
      input: 'logGroupName',
      optional: true,
    },
  ],
}

export const logsRegistryEntries = [logsLogGroupEntry]
