// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

type IoTButtonEvent struct {
	SerialNumber   string `json:"serialNumber"`
	ClickType      string `json:"clickType"`
	BatteryVoltage string `json:"batteryVoltage"`
}
