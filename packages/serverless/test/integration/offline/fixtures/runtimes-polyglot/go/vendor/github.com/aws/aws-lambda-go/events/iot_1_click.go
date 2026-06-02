// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

// IoTOneClickEvent represents a click event published by clicking button type
// device.
type IoTOneClickEvent struct {
	DeviceEvent   IoTOneClickDeviceEvent   `json:"deviceEvent"`
	DeviceInfo    IoTOneClickDeviceInfo    `json:"deviceInfo"`
	PlacementInfo IoTOneClickPlacementInfo `json:"placementInfo"`
}

type IoTOneClickDeviceEvent struct {
	ButtonClicked IoTOneClickButtonClicked `json:"buttonClicked"`
}

type IoTOneClickButtonClicked struct {
	ClickType    string `json:"clickType"`
	ReportedTime string `json:"reportedTime"`
}

type IoTOneClickDeviceInfo struct {
	Attributes    map[string]string `json:"attributes"`
	Type          string            `json:"type"`
	DeviceID      string            `json:"deviceId"`
	RemainingLife float64           `json:"remainingLife"`
}

type IoTOneClickPlacementInfo struct {
	ProjectName   string            `json:"projectName"`
	PlacementName string            `json:"placementName"`
	Attributes    map[string]string `json:"attributes"`
	Devices       map[string]string `json:"devices"`
}
