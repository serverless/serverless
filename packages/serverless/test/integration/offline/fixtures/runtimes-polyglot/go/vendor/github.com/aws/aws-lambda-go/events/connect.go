// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// ConnectEvent contains the data structure for a Connect event.
type ConnectEvent struct {
	Details ConnectDetails `json:"Details"`
	Name    string         `json:"Name"` // The name of the event.
}

// ConnectDetails holds the details of a Connect event
type ConnectDetails struct {
	ContactData ConnectContactData `json:"ContactData"`

	// The parameters that have been set in the Connect instance at the time of the Lambda invocation.
	Parameters map[string]string `json:"Parameters"`
}

// ConnectContactData holds all of the contact information for the user that invoked the Connect event.
type ConnectContactData struct {
	// The custom attributes from Connect that the Lambda function was invoked with.
	Attributes       map[string]string `json:"Attributes"`
	Channel          string            `json:"Channel"`
	ContactID        string            `json:"ContactId"`
	CustomerEndpoint ConnectEndpoint   `json:"CustomerEndpoint"`
	InitialContactID string            `json:"InitialContactId"`

	// Either: INBOUND/OUTBOUND/TRANSFER/CALLBACK
	InitiationMethod  string          `json:"InitiationMethod"`
	PreviousContactID string          `json:"PreviousContactId"`
	Queue             ConnectQueue    `json:"Queue"`
	SystemEndpoint    ConnectEndpoint `json:"SystemEndpoint"`
	InstanceARN       string          `json:"InstanceARN"`
}

// ConnectEndpoint represents routing information.
type ConnectEndpoint struct {
	Address string `json:"Address"`
	Type    string `json:"Type"`
}

// ConnectQueue represents a queue object.
type ConnectQueue struct {
	Name string `json:"Name"`
	ARN  string `json:"ARN"`
}

// ConnectResponse is the structure that Connect expects to get back from Lambda.
// These return values can be used in Connect to perform further routing decisions.
type ConnectResponse map[string]string
