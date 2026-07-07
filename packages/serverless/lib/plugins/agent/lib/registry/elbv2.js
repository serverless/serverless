// Registry entries for the `elbv2` AWS service (alias `alb`).

const targetGroupEntry = {
  cfnType: 'AWS::ElasticLoadBalancingV2::TargetGroup',
  awsService: 'elbv2',
  category: 'api',
  engineClient: 'elbv2',
  // PhysicalResourceId is the target group ARN as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    {
      key: 'targetGroups',
      method: 'DescribeTargetGroups',
      params: (identifier) => ({ TargetGroupArns: [identifier] }),
    },
    {
      key: 'attributes',
      method: 'DescribeTargetGroupAttributes',
      input: 'TargetGroupArn',
    },
    {
      key: 'targetHealth',
      method: 'DescribeTargetHealth',
      input: 'TargetGroupArn',
    },
  ],
}

const listenerRuleEntry = {
  cfnType: 'AWS::ElasticLoadBalancingV2::ListenerRule',
  awsService: 'elbv2',
  category: 'api',
  engineClient: 'elbv2',
  // PhysicalResourceId is the listener rule ARN as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    {
      key: 'rules',
      method: 'DescribeRules',
      params: (identifier) => ({ RuleArns: [identifier] }),
    },
  ],
}

export const elbv2RegistryEntries = [targetGroupEntry, listenerRuleEntry]
