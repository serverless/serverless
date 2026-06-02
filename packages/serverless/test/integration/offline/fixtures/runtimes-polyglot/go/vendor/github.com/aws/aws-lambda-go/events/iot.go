package events

// IoTCoreCustomAuthorizerRequest represents the request to an IoT Core custom authorizer.
// See https://docs.aws.amazon.com/iot/latest/developerguide/config-custom-auth.html
type IoTCoreCustomAuthorizerRequest struct {
	Token              string                     `json:"token"`
	SignatureVerified  bool                       `json:"signatureVerified"`
	Protocols          []string                   `json:"protocols"`
	ProtocolData       *IoTCoreProtocolData       `json:"protocolData,omitempty"`
	ConnectionMetadata *IoTCoreConnectionMetadata `json:"connectionMetadata,omitempty"`
}

type IoTCoreProtocolData struct {
	TLS  *IoTCoreTLSContext  `json:"tls,omitempty"`
	HTTP *IoTCoreHTTPContext `json:"http,omitempty"`
	MQTT *IoTCoreMQTTContext `json:"mqtt,omitempty"`
}

type IoTCoreTLSContext struct {
	ServerName string `json:"serverName"`
}

type IoTCoreHTTPContext struct {
	Headers     map[string]string `json:"headers,omitempty"`
	QueryString string            `json:"queryString"`
}

type IoTCoreMQTTContext struct {
	ClientID string `json:"clientId"`
	Password []byte `json:"password"`
	Username string `json:"username"`
}

type IoTCoreConnectionMetadata struct {
	ID string `json:"id"`
}

// IoTCoreCustomAuthorizerResponse represents the response from an IoT Core custom authorizer.
// See https://docs.aws.amazon.com/iot/latest/developerguide/config-custom-auth.html
type IoTCoreCustomAuthorizerResponse struct {
	IsAuthenticated          bool                 `json:"isAuthenticated"`
	PrincipalID              string               `json:"principalId"`
	DisconnectAfterInSeconds uint32               `json:"disconnectAfterInSeconds"`
	RefreshAfterInSeconds    uint32               `json:"refreshAfterInSeconds"`
	PolicyDocuments          []*IAMPolicyDocument `json:"policyDocuments"`
}
