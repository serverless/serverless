// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

import (
	"encoding/json"
)

type KafkaEvent struct {
	EventSource      string                   `json:"eventSource"`
	EventSourceARN   string                   `json:"eventSourceArn"`
	Records          map[string][]KafkaRecord `json:"records"`
	BootstrapServers string                   `json:"bootstrapServers"`
}

type KafkaRecord struct {
	Topic         string                       `json:"topic"`
	Partition     int64                        `json:"partition"`
	Offset        int64                        `json:"offset"`
	Timestamp     MilliSecondsEpochTime        `json:"timestamp"`
	TimestampType string                       `json:"timestampType"`
	Key           string                       `json:"key,omitempty"`
	Value         string                       `json:"value,omitempty"`
	Headers       []map[string]JSONNumberBytes `json:"headers"`
}

// JSONNumberBytes represents array of bytes in Headers field.
type JSONNumberBytes []byte

// MarshalJSON converts byte array into array of signed integers.
func (b JSONNumberBytes) MarshalJSON() ([]byte, error) {
	signedNumbers := make([]int8, len(b))
	for i, value := range b {
		signedNumbers[i] = int8(value)
	}
	return json.Marshal(signedNumbers)
}

// UnmarshalJSON converts a given json with potential negative values into byte array.
func (b *JSONNumberBytes) UnmarshalJSON(data []byte) error {
	var signedNumbers []int8
	if err := json.Unmarshal(data, &signedNumbers); err != nil {
		return err
	}
	*b = make(JSONNumberBytes, len(signedNumbers))
	for i, value := range signedNumbers {
		(*b)[i] = byte(value)
	}
	return nil
}
