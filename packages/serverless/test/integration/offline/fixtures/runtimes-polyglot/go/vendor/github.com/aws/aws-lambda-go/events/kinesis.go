// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

type KinesisEvent struct {
	Records []KinesisEventRecord `json:"Records"`
}

// KinesisTimeWindowEvent represents an Amazon Dynamodb event when using time windows
// ref. https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html#services-kinesis-windows
type KinesisTimeWindowEvent struct {
	KinesisEvent
	TimeWindowProperties
}

// KinesisTimeWindowEventResponse is the outer structure to report batch item failures for KinesisTimeWindowEvent.
type KinesisTimeWindowEventResponse struct {
	TimeWindowEventResponseProperties
	BatchItemFailures []KinesisBatchItemFailure `json:"batchItemFailures"`
}

type KinesisEventRecord struct {
	AwsRegion         string        `json:"awsRegion"` //nolint: stylecheck
	EventID           string        `json:"eventID"`
	EventName         string        `json:"eventName"`
	EventSource       string        `json:"eventSource"`
	EventSourceArn    string        `json:"eventSourceARN"` //nolint: stylecheck
	EventVersion      string        `json:"eventVersion"`
	InvokeIdentityArn string        `json:"invokeIdentityArn"` //nolint: stylecheck
	Kinesis           KinesisRecord `json:"kinesis"`
}

type KinesisRecord struct {
	ApproximateArrivalTimestamp SecondsEpochTime `json:"approximateArrivalTimestamp"`
	Data                        []byte           `json:"data"`
	EncryptionType              string           `json:"encryptionType,omitempty"`
	PartitionKey                string           `json:"partitionKey"`
	SequenceNumber              string           `json:"sequenceNumber"`
	KinesisSchemaVersion        string           `json:"kinesisSchemaVersion"`
}
