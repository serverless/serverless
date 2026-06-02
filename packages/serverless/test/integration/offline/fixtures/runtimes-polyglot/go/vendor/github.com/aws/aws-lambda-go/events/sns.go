// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

import (
	"time"
)

type SNSEvent struct {
	Records []SNSEventRecord `json:"Records"`
}

type SNSEventRecord struct {
	EventVersion         string    `json:"EventVersion"`
	EventSubscriptionArn string    `json:"EventSubscriptionArn"` //nolint: stylecheck
	EventSource          string    `json:"EventSource"`
	SNS                  SNSEntity `json:"Sns"`
}

type SNSEntity struct {
	Signature         string                 `json:"Signature"`
	MessageID         string                 `json:"MessageId"`
	Type              string                 `json:"Type"`
	TopicArn          string                 `json:"TopicArn"` //nolint: stylecheck
	MessageAttributes map[string]interface{} `json:"MessageAttributes"`
	SignatureVersion  string                 `json:"SignatureVersion"`
	Timestamp         time.Time              `json:"Timestamp"`
	SigningCertURL    string                 `json:"SigningCertUrl"`
	Message           string                 `json:"Message"`
	UnsubscribeURL    string                 `json:"UnsubscribeUrl"`
	Subject           string                 `json:"Subject"`
}

type CloudWatchAlarmSNSPayload struct {
	AlarmName        string                 `json:"AlarmName"`
	AlarmDescription string                 `json:"AlarmDescription"`
	AWSAccountID     string                 `json:"AWSAccountId"`
	NewStateValue    string                 `json:"NewStateValue"`
	NewStateReason   string                 `json:"NewStateReason"`
	StateChangeTime  string                 `json:"StateChangeTime"`
	Region           string                 `json:"Region"`
	AlarmARN         string                 `json:"AlarmArn"`
	OldStateValue    string                 `json:"OldStateValue"`
	Trigger          CloudWatchAlarmTrigger `json:"Trigger"`
}

type CloudWatchAlarmTrigger struct {
	Period                           int64                       `json:"Period"`
	EvaluationPeriods                int64                       `json:"EvaluationPeriods"`
	ComparisonOperator               string                      `json:"ComparisonOperator"`
	Threshold                        float64                     `json:"Threshold"`
	TreatMissingData                 string                      `json:"TreatMissingData"`
	EvaluateLowSampleCountPercentile string                      `json:"EvaluateLowSampleCountPercentile"`
	Metrics                          []CloudWatchMetricDataQuery `json:"Metrics,omitempty"`
	MetricName                       string                      `json:"MetricName,omitempty"`
	Namespace                        string                      `json:"Namespace,omitempty"`
	StatisticType                    string                      `json:"StatisticType,omitempty"`
	Statistic                        string                      `json:"Statistic,omitempty"`
	Unit                             string                      `json:"Unit,omitempty"`
	Dimensions                       []CloudWatchDimension       `json:"Dimensions,omitempty"`
}

type CloudWatchMetricDataQuery struct {
	Expression string               `json:"Expression,omitempty"`
	ID         string               `json:"Id"`
	Label      string               `json:"Label,omitempty"`
	MetricStat CloudWatchMetricStat `json:"MetricStat,omitempty"`
	Period     int64                `json:"Period,omitempty"`
	ReturnData bool                 `json:"ReturnData,omitempty"`
}

type CloudWatchMetricStat struct {
	Metric CloudWatchMetric `json:"Metric"`
	Period int64            `json:"Period"`
	Stat   string           `json:"Stat"`
	Unit   string           `json:"Unit,omitempty"`
}

type CloudWatchMetric struct {
	Dimensions []CloudWatchDimension `json:"Dimensions,omitempty"`
	MetricName string                `json:"MetricName,omitempty"`
	Namespace  string                `json:"Namespace,omitempty"`
}

type CloudWatchDimension struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
