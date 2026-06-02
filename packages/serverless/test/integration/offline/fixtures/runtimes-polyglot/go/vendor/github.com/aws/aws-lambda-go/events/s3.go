// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

import (
	"encoding/json"
	"net/url"
	"time"
)

// S3Event which wrap an array of S3EventRecord
type S3Event struct {
	Records []S3EventRecord `json:"Records"`
}

// S3EventRecord which wrap record data
type S3EventRecord struct {
	EventVersion      string              `json:"eventVersion"`
	EventSource       string              `json:"eventSource"`
	AWSRegion         string              `json:"awsRegion"`
	EventTime         time.Time           `json:"eventTime"`
	EventName         string              `json:"eventName"`
	PrincipalID       S3UserIdentity      `json:"userIdentity"`
	RequestParameters S3RequestParameters `json:"requestParameters"`
	ResponseElements  map[string]string   `json:"responseElements"`
	S3                S3Entity            `json:"s3"`
}

type S3UserIdentity struct {
	PrincipalID string `json:"principalId"`
}

type S3RequestParameters struct {
	SourceIPAddress string `json:"sourceIPAddress"`
}

type S3Entity struct {
	SchemaVersion   string   `json:"s3SchemaVersion"`
	ConfigurationID string   `json:"configurationId"`
	Bucket          S3Bucket `json:"bucket"`
	Object          S3Object `json:"object"`
}

type S3Bucket struct {
	Name          string         `json:"name"`
	OwnerIdentity S3UserIdentity `json:"ownerIdentity"`
	Arn           string         `json:"arn"` //nolint: stylecheck
}

type S3Object struct {
	Key           string `json:"key"`
	Size          int64  `json:"size,omitempty"`
	URLDecodedKey string `json:"urlDecodedKey"`
	VersionID     string `json:"versionId"`
	ETag          string `json:"eTag"`
	Sequencer     string `json:"sequencer"`
}

func (o *S3Object) UnmarshalJSON(data []byte) error {
	type rawS3Object S3Object
	if err := json.Unmarshal(data, (*rawS3Object)(o)); err != nil {
		return err
	}
	key, err := url.QueryUnescape(o.Key)
	if err != nil {
		return err
	}
	o.URLDecodedKey = key

	return nil
}

type S3TestEvent struct {
	Service   string    `json:"Service"`
	Bucket    string    `json:"Bucket"`
	Event     string    `json:"Event"`
	Time      time.Time `json:"Time"`
	RequestID string    `json:"RequestId"`
	HostID    string    `json:"HostId"`
}
