package events

type ClientVPNConnectionHandlerRequest struct {
	ConnectionID         string `json:"connection-id"`
	EndpointID           string `json:"endpoint-id"`
	CommonName           string `json:"common-name"`
	Username             string `json:"username"`
	OSPlatform           string `json:"platform"`
	OSPlatformVersion    string `json:"platform-version"`
	PublicIP             string `json:"public-ip"`
	ClientOpenVPNVersion string `json:"client-openvpn-version"`
	SchemaVersion        string `json:"schema-version"`
}

type ClientVPNConnectionHandlerResponse struct {
	Allow                             bool     `json:"allow"`
	ErrorMsgOnFailedPostureCompliance string   `json:"error-msg-on-failed-posture-compliance"`
	PostureComplianceStatuses         []string `json:"posture-compliance-statuses"`
	SchemaVersion                     string   `json:"schema-version"`
}
