// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// S3BatchJobEvent encapsulates the detail of a s3 batch job
type S3BatchJobEvent struct {
	InvocationSchemaVersion string           `json:"invocationSchemaVersion"`
	InvocationID            string           `json:"invocationId"`
	Job                     S3BatchJob       `json:"job"`
	Tasks                   []S3BatchJobTask `json:"tasks"`
}

// S3BatchJob whichs have the job id
type S3BatchJob struct {
	ID string `json:"id"`
}

// S3BatchJobTask represents one task in the s3 batch job and have all task details
type S3BatchJobTask struct {
	TaskID      string `json:"taskId"`
	S3Key       string `json:"s3Key"`
	S3VersionID string `json:"s3VersionId"`
	S3BucketARN string `json:"s3BucketArn"`
}

// S3BatchJobResponse is the response of a iven s3 batch job with the results
type S3BatchJobResponse struct {
	InvocationSchemaVersion string             `json:"invocationSchemaVersion"`
	TreatMissingKeysAs      string             `json:"treatMissingKeysAs"`
	InvocationID            string             `json:"invocationId"`
	Results                 []S3BatchJobResult `json:"results"`
}

// S3BatchJobResult represents the result of a given task
type S3BatchJobResult struct {
	TaskID       string `json:"taskId"`
	ResultCode   string `json:"resultCode"`
	ResultString string `json:"resultString"`
}
