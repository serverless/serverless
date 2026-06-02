package events

// KinesisEventResponse is the outer structure to report batch item failures for KinesisEvent.
type KinesisEventResponse struct {
	BatchItemFailures []KinesisBatchItemFailure `json:"batchItemFailures"`
}

// KinesisBatchItemFailure is the individual record which failed processing.
type KinesisBatchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

// DynamoDBEventResponse is the outer structure to report batch item failures for DynamoDBEvent.
type DynamoDBEventResponse struct {
	BatchItemFailures []DynamoDBBatchItemFailure `json:"batchItemFailures"`
}

// DynamoDBBatchItemFailure is the individual record which failed processing.
type DynamoDBBatchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

// SQSEventResponse is the outer structure to report batch item failures for SQSEvent.
type SQSEventResponse struct {
	BatchItemFailures []SQSBatchItemFailure `json:"batchItemFailures"`
}

// SQSBatchItemFailure is the individual record which failed processing.
type SQSBatchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}
