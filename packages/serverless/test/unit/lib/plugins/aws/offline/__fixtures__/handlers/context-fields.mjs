export function handler(event, context) {
  return {
    functionVersion: context.functionVersion,
    logGroupName: context.logGroupName,
    logStreamName: context.logStreamName,
  }
}
