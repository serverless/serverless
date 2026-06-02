package events

import (
	"errors"
	"fmt"
	"time"
)

// CodeCommitEvent represents a CodeCommit event
type CodeCommitEvent struct {
	Records []CodeCommitRecord `json:"Records"`
}

// String returns a string representation of this object.
// Useful for testing and debugging.
func (e CodeCommitEvent) String() string {
	return fmt.Sprintf("{Records: %v}", e.Records)
}

type CodeCommitEventTime time.Time

// https://golang.org/pkg/time/#Parse
const codeCommitEventTimeReference = "\"2006-01-2T15:04:05.000-0700\""

func (t *CodeCommitEventTime) MarshalJSON() ([]byte, error) {
	if t == nil {
		return nil, errors.New("CodeCommitEventTime cannot be nil")
	}

	gt := time.Time(*t)
	return []byte(gt.Format(codeCommitEventTimeReference)), nil
}

func (t *CodeCommitEventTime) UnmarshalJSON(data []byte) error {
	if t == nil {
		return errors.New("CodeCommitEventTime cannot be nil")
	}

	pt, err := time.Parse(codeCommitEventTimeReference, string(data))
	if err == nil {
		*t = CodeCommitEventTime(pt)
	}
	return err
}

// CodeCommitRecord represents a CodeCommit record
type CodeCommitRecord struct {
	EventID              string               `json:"eventId"`
	EventVersion         string               `json:"eventVersion"`
	EventTime            CodeCommitEventTime  `json:"eventTime"`
	EventTriggerName     string               `json:"eventTriggerName"`
	EventPartNumber      uint64               `json:"eventPartNumber"`
	CodeCommit           CodeCommitCodeCommit `json:"codecommit"`
	EventName            string               `json:"eventName"`
	EventTriggerConfigId string               `json:"eventTriggerConfigId"` //nolint: stylecheck
	EventSourceARN       string               `json:"eventSourceARN"`
	UserIdentityARN      string               `json:"userIdentityARN"`
	EventSource          string               `json:"eventSource"`
	AWSRegion            string               `json:"awsRegion"`
	EventTotalParts      uint64               `json:"eventTotalParts"`
	CustomData           string               `json:"customData,omitempty"`
}

// String returns a string representation of this object.
// Useful for testing and debugging.
func (r CodeCommitRecord) String() string {
	return fmt.Sprintf(
		"{eventId: %v, eventVersion: %v, eventTime: %v, eventTriggerName: %v, "+
			"eventPartNumber: %v, codeCommit: %v, eventName: %v, "+
			"eventTriggerConfigId: %v, eventSourceARN: %v, userIdentityARN: %v, "+
			"eventSource: %v, awsRegion: %v, eventTotalParts: %v, customData: %v}",
		r.EventID, r.EventVersion, r.EventTime, r.EventTriggerName,
		r.EventPartNumber, r.CodeCommit, r.EventName,
		r.EventTriggerConfigId, r.EventSourceARN, r.UserIdentityARN,
		r.EventSource, r.AWSRegion, r.EventTotalParts, r.CustomData)
}

// CodeCommitCodeCommit represents a CodeCommit object in a record
type CodeCommitCodeCommit struct {
	References []CodeCommitReference `json:"references"`
}

// String returns a string representation of this object.
// Useful for testing and debugging.
func (c CodeCommitCodeCommit) String() string {
	return fmt.Sprintf("{references: %v}", c.References)
}

// CodeCommitReference represents a Reference object in a CodeCommit object
type CodeCommitReference struct {
	Commit  string `json:"commit"`
	Ref     string `json:"ref"`
	Created bool   `json:"created,omitempty"`
}

// String returns a string representation of this object.
// Useful for testing and debugging.
func (r CodeCommitReference) String() string {
	return fmt.Sprintf(
		"{commit: %v, ref: %v, created: %v}", r.Commit, r.Ref, r.Created)
}
