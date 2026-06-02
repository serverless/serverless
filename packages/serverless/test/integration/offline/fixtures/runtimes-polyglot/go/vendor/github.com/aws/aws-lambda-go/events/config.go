// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// ConfigEvent contains data from an event sent from AWS Config
type ConfigEvent struct {
	// The ID of the AWS account that owns the rule
	AccountID string `json:"accountId"`
	// The ARN that AWS Config assigned to the rule
	ConfigRuleArn string `json:"configRuleArn"` //nolint:stylecheck
	ConfigRuleID  string `json:"configRuleId"`  //nolint:stylecheck
	// The name that you assigned to the rule that caused AWS Config to publish the event
	ConfigRuleName string `json:"configRuleName"`
	// A boolean value that indicates whether the AWS resource to be evaluated has been removed from the rule's scope
	EventLeftScope   bool   `json:"eventLeftScope"`
	ExecutionRoleArn string `json:"executionRoleArn"` //nolint:stylecheck
	// If the event is published in response to a resource configuration change, this value contains a JSON configuration item
	InvokingEvent string `json:"invokingEvent"`
	// A token that the function must pass to AWS Config with the PutEvaluations call
	ResultToken string `json:"resultToken"`
	// Key/value pairs that the function processes as part of its evaluation logic
	RuleParameters string `json:"ruleParameters"`
	Version        string `json:"version"`
}
