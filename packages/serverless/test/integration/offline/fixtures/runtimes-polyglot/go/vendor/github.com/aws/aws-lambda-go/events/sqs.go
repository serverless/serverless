// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

type SQSEvent struct {
	Records []SQSMessage `json:"Records"`
}

type SQSMessage struct {
	MessageId              string                         `json:"messageId"` //nolint: stylecheck
	ReceiptHandle          string                         `json:"receiptHandle"`
	Body                   string                         `json:"body"`
	Md5OfBody              string                         `json:"md5OfBody"`
	Md5OfMessageAttributes string                         `json:"md5OfMessageAttributes"`
	Attributes             map[string]string              `json:"attributes"`
	MessageAttributes      map[string]SQSMessageAttribute `json:"messageAttributes"`
	EventSourceARN         string                         `json:"eventSourceARN"`
	EventSource            string                         `json:"eventSource"`
	AWSRegion              string                         `json:"awsRegion"`
}

type SQSMessageAttribute struct {
	StringValue      *string  `json:"stringValue,omitempty"`
	BinaryValue      []byte   `json:"binaryValue,omitempty"`
	StringListValues []string `json:"stringListValues"`
	BinaryListValues [][]byte `json:"binaryListValues"`
	DataType         string   `json:"dataType"`
}
