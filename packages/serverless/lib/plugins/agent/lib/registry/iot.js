// Registry entries for the `iot` AWS service. Two independent CFN types:
// TopicRule and ProvisioningTemplate.

const iotTopicRuleEntry = {
  cfnType: 'AWS::IoT::TopicRule',
  awsService: 'iot',
  category: 'iot',
  engineClient: 'iot',
  // PhysicalResourceId is the rule name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [{ key: 'rule', method: 'GetTopicRule', input: 'ruleName' }],
}

const iotProvisioningTemplateEntry = {
  cfnType: 'AWS::IoT::ProvisioningTemplate',
  awsService: 'iot',
  category: 'iot',
  engineClient: 'iot',
  // PhysicalResourceId is the template name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    {
      key: 'template',
      method: 'DescribeProvisioningTemplate',
      input: 'templateName',
    },
  ],
}

export const iotRegistryEntries = [
  iotTopicRuleEntry,
  iotProvisioningTemplateEntry,
]
