// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// CodePipelineJobEvent contains data from an event sent from AWS CodePipeline
type CodePipelineJobEvent struct {
	CodePipelineJob CodePipelineJob `json:"CodePipeline.job"`
}

// CodePipelineJob represents a job from an AWS CodePipeline event
type CodePipelineJob struct {
	ID        string           `json:"id"`
	AccountID string           `json:"accountId"`
	Data      CodePipelineData `json:"data"`
}

// CodePipelineData represents a job from an AWS CodePipeline event
type CodePipelineData struct {
	ActionConfiguration CodePipelineActionConfiguration `json:"actionConfiguration"`
	InputArtifacts      []CodePipelineInputArtifact     `json:"inputArtifacts"`
	OutPutArtifacts     []CodePipelineOutputArtifact    `json:"outputArtifacts"`
	ArtifactCredentials CodePipelineArtifactCredentials `json:"artifactCredentials"`
	ContinuationToken   string                          `json:"continuationToken"`
}

// CodePipelineActionConfiguration represents an Action Configuration
type CodePipelineActionConfiguration struct {
	Configuration CodePipelineConfiguration `json:"configuration"`
}

// CodePipelineConfiguration represents a configuration for an Action Configuration
type CodePipelineConfiguration struct {
	FunctionName   string `json:"FunctionName"`
	UserParameters string `json:"UserParameters"`
}

// CodePipelineInputArtifact represents an input artifact
type CodePipelineInputArtifact struct {
	Location CodePipelineInputLocation `json:"location"`
	Revision *string                   `json:"revision"`
	Name     string                    `json:"name"`
}

// CodePipelineInputLocation represents a input location
type CodePipelineInputLocation struct {
	S3Location   CodePipelineS3Location `json:"s3Location"`
	LocationType string                 `json:"type"`
}

// CodePipelineS3Location represents an s3 input location
type CodePipelineS3Location struct {
	BucketName string `json:"bucketName"`
	ObjectKey  string `json:"objectKey"`
}

// CodePipelineOutputArtifact represents an output artifact
type CodePipelineOutputArtifact struct {
	Location CodePipelineInputLocation `json:"location"`
	Revision *string                   `json:"revision"`
	Name     string                    `json:"name"`
}

// CodePipelineOutputLocation represents a output location
type CodePipelineOutputLocation struct {
	S3Location   CodePipelineS3Location `json:"s3Location"`
	LocationType string                 `json:"type"`
}

// CodePipelineArtifactCredentials represents CodePipeline artifact credentials
type CodePipelineArtifactCredentials struct {
	SecretAccessKey string `json:"secretAccessKey"`
	SessionToken    string `json:"sessionToken"`
	AccessKeyID     string `json:"accessKeyId"`
}
