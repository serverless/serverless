package events

import (
	"time"
)

const (
	CodePipelineEventSource              = "aws.codepipeline"
	CodePipelineExecutionEventDetailType = "CodePipeline Pipeline Execution State Change"
	CodePipelineActionEventDetailType    = "CodePipeline Action Execution State Change"
	CodePipelineStageEventDetailType     = "CodePipeline Stage Execution State Change"
)

type CodePipelineStageState string

const (
	CodePipelineStageStateStarted   CodePipelineStageState = "STARTED"
	CodePipelineStageStateSucceeded CodePipelineStageState = "SUCCEEDED"
	CodePipelineStageStateResumed   CodePipelineStageState = "RESUMED"
	CodePipelineStageStateFailed    CodePipelineStageState = "FAILED"
	CodePipelineStageStateCanceled  CodePipelineStageState = "CANCELED"
)

type CodePipelineState string

const (
	CodePipelineStateStarted    CodePipelineState = "STARTED"
	CodePipelineStateSucceeded  CodePipelineState = "SUCCEEDED"
	CodePipelineStateResumed    CodePipelineState = "RESUMED"
	CodePipelineStateFailed     CodePipelineState = "FAILED"
	CodePipelineStateCanceled   CodePipelineState = "CANCELED"
	CodePipelineStateSuperseded CodePipelineState = "SUPERSEDED"
)

type CodePipelineActionState string

const (
	CodePipelineActionStateStarted   CodePipelineActionState = "STARTED"
	CodePipelineActionStateSucceeded CodePipelineActionState = "SUCCEEDED"
	CodePipelineActionStateFailed    CodePipelineActionState = "FAILED"
	CodePipelineActionStateCanceled  CodePipelineActionState = "CANCELED"
)

// CodePipelineEvent is documented at:
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/EventTypes.html#codepipeline_event_type
type CodePipelineCloudWatchEvent struct {
	// Version is the version of the event's schema.
	Version string `json:"version"`

	// ID is the GUID of this event.
	ID string `json:"id"`

	// DetailType informs the schema of the Detail field. For deployment state-change
	// events, the value should be equal to CodePipelineDeploymentEventDetailType.
	// For instance state-change events, the value should be equal to
	// CodePipelineInstanceEventDetailType.
	DetailType string `json:"detail-type"`

	// Source should be equal to CodePipelineEventSource.
	Source string `json:"source"`

	// AccountID is the id of the AWS account from which the event originated.
	AccountID string `json:"account"`

	// Time is the event's timestamp.
	Time time.Time `json:"time"`

	// Region is the AWS region from which the event originated.
	Region string `json:"region"`

	// Resources is a list of ARNs of CodePipeline applications and deployment
	// groups that this event pertains to.
	Resources []string `json:"resources"`

	// Detail contains information specific to a deployment event.
	Detail CodePipelineEventDetail `json:"detail"`
}

type CodePipelineEventDetail struct {
	Pipeline string `json:"pipeline"`

	// From live testing this is always int64 not string as documented
	Version int64 `json:"version"`

	ExecutionID string `json:"execution-id"`

	Stage string `json:"stage"`

	Action string `json:"action"`

	State CodePipelineState `json:"state"`

	Region string `json:"region"`

	Type CodePipelineEventDetailType `json:"type,omitempty"`

	ExecutionResult CodePipelineEventDetailExecutionResult `json:"execution-result,omitempty"`
}

type CodePipelineEventDetailType struct {
	Owner string `json:"owner"`

	Category string `json:"category"`

	Provider string `json:"provider"`

	// From published EventBridge schema registry this is always int64 not string as documented
	Version int64 `json:"version"`
}

type CodePipelineEventDetailExecutionResult struct {
	ExternalExecutionURL string `json:"external-execution-url"`

	ExternalExecutionSummary string `json:"external-execution-summary"`

	ExternalExecutionID string `json:"external-execution-id"`

	ErrorCode string `json:"error-code,omitempty"`
}
