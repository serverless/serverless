// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// The DynamoDBEvent stream event handled to Lambda
// http://docs.aws.amazon.com/lambda/latest/dg/eventsources.html#eventsources-ddb-update
type DynamoDBEvent struct {
	Records []DynamoDBEventRecord `json:"Records"`
}

// DynamoDBTimeWindowEvent represents an Amazon Dynamodb event when using time windows
// ref. https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-windows
type DynamoDBTimeWindowEvent struct {
	DynamoDBEvent
	TimeWindowProperties
}

// DynamoDBTimeWindowEventResponse is the outer structure to report batch item failures for DynamoDBTimeWindowEvent.
type DynamoDBTimeWindowEventResponse struct {
	TimeWindowEventResponseProperties
	BatchItemFailures []DynamoDBBatchItemFailure `json:"batchItemFailures"`
}

// DynamoDBEventRecord stores information about each record of a DynamoDB stream event
type DynamoDBEventRecord struct {
	// The region in which the GetRecords request was received.
	AWSRegion string `json:"awsRegion"`

	// The main body of the stream record, containing all of the DynamoDB-specific
	// fields.
	Change DynamoDBStreamRecord `json:"dynamodb"`

	// A globally unique identifier for the event that was recorded in this stream
	// record.
	EventID string `json:"eventID"`

	// The type of data modification that was performed on the DynamoDB table:
	//
	//    * INSERT - a new item was added to the table.
	//
	//    * MODIFY - one or more of an existing item's attributes were modified.
	//
	//    * REMOVE - the item was deleted from the table
	EventName string `json:"eventName"`

	// The AWS service from which the stream record originated. For DynamoDB Streams,
	// this is aws:dynamodb.
	EventSource string `json:"eventSource"`

	// The version number of the stream record format. This number is updated whenever
	// the structure of Record is modified.
	//
	// Client applications must not assume that eventVersion will remain at a particular
	// value, as this number is subject to change at any time. In general, eventVersion
	// will only increase as the low-level DynamoDB Streams API evolves.
	EventVersion string `json:"eventVersion"`

	// The event source ARN of DynamoDB
	EventSourceArn string `json:"eventSourceARN"` //nolint: stylecheck

	// Items that are deleted by the Time to Live process after expiration have
	// the following fields:
	//
	//    * Records[].userIdentity.type
	//
	// "Service"
	//
	//    * Records[].userIdentity.principalId
	//
	// "dynamodb.amazonaws.com"
	UserIdentity *DynamoDBUserIdentity `json:"userIdentity,omitempty"`
}

type DynamoDBUserIdentity struct {
	Type        string `json:"type"`
	PrincipalID string `json:"principalId"`
}

// DynamoDBStreamRecord represents a description of a single data modification that was performed on an item
// in a DynamoDB table.
type DynamoDBStreamRecord struct {

	// The approximate date and time when the stream record was created, in UNIX
	// epoch time (http://www.epochconverter.com/) format.
	ApproximateCreationDateTime SecondsEpochTime `json:"ApproximateCreationDateTime,omitempty"`

	// The primary key attribute(s) for the DynamoDB item that was modified.
	Keys map[string]DynamoDBAttributeValue `json:"Keys,omitempty"`

	// The item in the DynamoDB table as it appeared after it was modified.
	NewImage map[string]DynamoDBAttributeValue `json:"NewImage,omitempty"`

	// The item in the DynamoDB table as it appeared before it was modified.
	OldImage map[string]DynamoDBAttributeValue `json:"OldImage,omitempty"`

	// The sequence number of the stream record.
	SequenceNumber string `json:"SequenceNumber"`

	// The size of the stream record, in bytes.
	SizeBytes int64 `json:"SizeBytes"`

	// The type of data from the modified DynamoDB item that was captured in this
	// stream record.
	StreamViewType string `json:"StreamViewType"`
}

type DynamoDBKeyType string

const (
	DynamoDBKeyTypeHash  DynamoDBKeyType = "HASH"
	DynamoDBKeyTypeRange DynamoDBKeyType = "RANGE"
)

type DynamoDBOperationType string

const (
	DynamoDBOperationTypeInsert DynamoDBOperationType = "INSERT"
	DynamoDBOperationTypeModify DynamoDBOperationType = "MODIFY"
	DynamoDBOperationTypeRemove DynamoDBOperationType = "REMOVE"
)

type DynamoDBSharedIteratorType string

const (
	DynamoDBShardIteratorTypeTrimHorizon         DynamoDBSharedIteratorType = "TRIM_HORIZON"
	DynamoDBShardIteratorTypeLatest              DynamoDBSharedIteratorType = "LATEST"
	DynamoDBShardIteratorTypeAtSequenceNumber    DynamoDBSharedIteratorType = "AT_SEQUENCE_NUMBER"
	DynamoDBShardIteratorTypeAfterSequenceNumber DynamoDBSharedIteratorType = "AFTER_SEQUENCE_NUMBER"
)

type DynamoDBStreamStatus string

const (
	DynamoDBStreamStatusEnabling  DynamoDBStreamStatus = "ENABLING"
	DynamoDBStreamStatusEnabled   DynamoDBStreamStatus = "ENABLED"
	DynamoDBStreamStatusDisabling DynamoDBStreamStatus = "DISABLING"
	DynamoDBStreamStatusDisabled  DynamoDBStreamStatus = "DISABLED"
)

type DynamoDBStreamViewType string

const (
	DynamoDBStreamViewTypeNewImage        DynamoDBStreamViewType = "NEW_IMAGE"          // the entire item, as it appeared after it was modified.
	DynamoDBStreamViewTypeOldImage        DynamoDBStreamViewType = "OLD_IMAGE"          // the entire item, as it appeared before it was modified.
	DynamoDBStreamViewTypeNewAndOldImages DynamoDBStreamViewType = "NEW_AND_OLD_IMAGES" // both the new and the old item images of the item.
	DynamoDBStreamViewTypeKeysOnly        DynamoDBStreamViewType = "KEYS_ONLY"          // only the key attributes of the modified item.
)
