package events

import (
	"time"
)

const (
	CodeDeployEventSource               = "aws.codedeploy"
	CodeDeployDeploymentEventDetailType = "CodeDeploy Deployment State-change Notification"
	CodeDeployInstanceEventDetailType   = "CodeDeploy Instance State-change Notification"
)

type CodeDeployDeploymentState string

const (
	CodeDeployDeploymentStateFailure CodeDeployDeploymentState = "FAILURE"
	CodeDeployDeploymentStateReady   CodeDeployDeploymentState = "READY"
	CodeDeployDeploymentStateStart   CodeDeployDeploymentState = "START"
	CodeDeployDeploymentStateStop    CodeDeployDeploymentState = "STOP"
	CodeDeployDeploymentStateSuccess CodeDeployDeploymentState = "SUCCESS"
)

// CodeDeployEvent is documented at:
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/EventTypes.html#acd_event_types
type CodeDeployEvent struct {
	// AccountID is the id of the AWS account from which the event originated.
	AccountID string `json:"account"`

	// Region is the AWS region from which the event originated.
	Region string `json:"region"`

	// DetailType informs the schema of the Detail field. For deployment state-change
	// events, the value should be equal to CodeDeployDeploymentEventDetailType.
	// For instance state-change events, the value should be equal to
	// CodeDeployInstanceEventDetailType.
	DetailType string `json:"detail-type"`

	// Source should be equal to CodeDeployEventSource.
	Source string `json:"source"`

	// Version is the version of the event's schema.
	Version string `json:"version"`

	// Time is the event's timestamp.
	Time time.Time `json:"time"`

	// ID is the GUID of this event.
	ID string `json:"id"`

	// Resources is a list of ARNs of CodeDeploy applications and deployment
	// groups that this event pertains to.
	Resources []string `json:"resources"`

	// Detail contains information specific to a deployment event.
	Detail CodeDeployEventDetail `json:"detail"`
}

type CodeDeployEventDetail struct {
	// InstanceGroupID is the ID of the instance group.
	InstanceGroupID string `json:"instanceGroupId"`

	// InstanceID is the id of the instance. This field is non-empty only if
	// the DetailType of the complete event is CodeDeployInstanceEventDetailType.
	InstanceID string `json:"instanceId,omitempty"`

	// Region is the AWS region that the event originated from.
	Region string `json:"region"`

	// Application is the name of the CodeDeploy application.
	Application string `json:"application"`

	// DeploymentID is the id of the deployment.
	DeploymentID string `json:"deploymentId"`

	// State is the new state of the deployment.
	State CodeDeployDeploymentState `json:"state"`

	// DeploymentGroup is the name of the deployment group.
	DeploymentGroup string `json:"deploymentGroup"`
}
