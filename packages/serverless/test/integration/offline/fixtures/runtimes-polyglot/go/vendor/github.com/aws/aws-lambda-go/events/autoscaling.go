package events

import (
	"time"
)

// AutoScalingEvent struct is used to parse the json for auto scaling event types //
type AutoScalingEvent struct {
	Version    string                 `json:"version"`     // The version of event data
	ID         string                 `json:"id"`          // The unique ID of the event
	DetailType string                 `json:"detail-type"` //Details about event type
	Source     string                 `json:"source"`      //Source of the event
	AccountID  string                 `json:"account"`     //AccountId
	Time       time.Time              `json:"time"`        //Event timestamp
	Region     string                 `json:"region"`      //Region of event
	Resources  []string               `json:"resources"`   //Information about resources impacted by event
	Detail     map[string]interface{} `json:"detail"`
}
