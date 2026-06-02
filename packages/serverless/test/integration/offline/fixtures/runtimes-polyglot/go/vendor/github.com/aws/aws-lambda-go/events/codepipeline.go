package events

// CodePipelineJob has been incorrectly assigned as CodePipelineEvent
//   - https://github.com/aws/aws-lambda-go/issues/244
//
// This maintains backwards compatability until a v2 release
type CodePipelineEvent = CodePipelineJobEvent
