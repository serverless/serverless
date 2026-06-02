// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

type KinesisAnalyticsOutputDeliveryEvent struct {
	InvocationID   string                                      `json:"invocationId"`
	ApplicationARN string                                      `json:"applicationArn"`
	Records        []KinesisAnalyticsOutputDeliveryEventRecord `json:"records"`
}

type KinesisAnalyticsOutputDeliveryEventRecord struct {
	RecordID string `json:"recordId"`
	Data     []byte `json:"data"`
}

type KinesisAnalyticsOutputDeliveryResponse struct {
	Records []KinesisAnalyticsOutputDeliveryResponseRecord `json:"records"`
}

const (
	KinesisAnalyticsOutputDeliveryOK     = "Ok"
	KinesisAnalyticsOutputDeliveryFailed = "DeliveryFailed"
)

type KinesisAnalyticsOutputDeliveryResponseRecord struct {
	RecordID string `json:"recordId"`
	Result   string `json:"result"` //possible values include Ok and DeliveryFailed
}
