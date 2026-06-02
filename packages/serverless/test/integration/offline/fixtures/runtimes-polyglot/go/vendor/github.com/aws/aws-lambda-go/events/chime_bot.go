// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

import (
	"time"
)

type ChimeBotEvent struct {
	Sender               ChimeBotEventSender                `json:"Sender"`
	Discussion           ChimeBotEventDiscussion            `json:"Discussion"`
	EventType            string                             `json:"EventType"`
	InboundHTTPSEndpoint *ChimeBotEventInboundHTTPSEndpoint `json:"InboundHttpsEndpoint,omitempty"`
	EventTimestamp       time.Time                          `json:"EventTimestamp"`
	Message              string                             `json:"Message,omitempty"`
}

type ChimeBotEventSender struct {
	SenderID     string `json:"SenderId"`
	SenderIDType string `json:"SenderIdType"`
}

type ChimeBotEventDiscussion struct {
	DiscussionID   string `json:"DiscussionId"`
	DiscussionType string `json:"DiscussionType"`
}

type ChimeBotEventInboundHTTPSEndpoint struct {
	EndpointType string `json:"EndpointType"`
	URL          string `json:"Url"`
}
