// Registry entries for the `cloudwatch` AWS service. Two independent CFN
// types share this awsService token (both dispatch through the metrics
// sub-client of AwsCloudWatchClient -- see build-clients.js's "CLOUDWATCH
// REUSE" note): Alarm and Dashboard.

const cloudwatchAlarmEntry = {
  cfnType: 'AWS::CloudWatch::Alarm',
  awsService: 'cloudwatch',
  category: 'observability',
  engineClient: 'cloudwatch',
  // PhysicalResourceId is the alarm name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    {
      key: 'alarms',
      method: 'DescribeAlarms',
      // DescribeAlarms takes a LIST of names (AlarmNames), not a single
      // AlarmName -- wrap the identifier.
      params: (identifier) => ({ AlarmNames: [identifier] }),
    },
  ],
}

const cloudwatchDashboardEntry = {
  cfnType: 'AWS::CloudWatch::Dashboard',
  awsService: 'cloudwatch',
  category: 'observability',
  engineClient: 'cloudwatch',
  // PhysicalResourceId is the dashboard name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [{ key: 'dashboard', method: 'GetDashboard', input: 'DashboardName' }],
}

export const cloudwatchRegistryEntries = [
  cloudwatchAlarmEntry,
  cloudwatchDashboardEntry,
]
