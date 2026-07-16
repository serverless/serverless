// Registry entry for the `scheduler` AWS service.

const schedulerScheduleEntry = {
  cfnType: 'AWS::Scheduler::Schedule',
  awsService: 'scheduler',
  category: 'events',
  engineClient: 'scheduler',
  // PhysicalResourceId is the schedule Name (CFN `Ref` returns Name --
  // verified against the CloudFormation docs, 2026-07-03). The framework
  // does not compile a non-default GroupName, so GetSchedule is called with
  // Name alone (default group assumed by the SDK).
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [{ key: 'schedule', method: 'GetSchedule', input: 'Name' }],
}

export const schedulerRegistryEntries = [schedulerScheduleEntry]
