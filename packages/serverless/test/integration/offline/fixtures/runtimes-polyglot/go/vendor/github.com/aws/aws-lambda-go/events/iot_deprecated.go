package events

// IoTCustomAuthorizerRequest contains data coming in to a custom IoT device gateway authorizer function.
// Deprecated: Use IoTCoreCustomAuthorizerRequest instead. IoTCustomAuthorizerRequest does not correctly model the request schema
type IoTCustomAuthorizerRequest struct {
	HTTPContext        *IoTHTTPContext `json:"httpContext,omitempty"`
	MQTTContext        *IoTMQTTContext `json:"mqttContext,omitempty"`
	TLSContext         *IoTTLSContext  `json:"tlsContext,omitempty"`
	AuthorizationToken string          `json:"token"`
	TokenSignature     string          `json:"tokenSignature"`
}

// Deprecated: Use IoTCoreHTTPContext
type IoTHTTPContext IoTCoreHTTPContext

// Deprecated: Use IoTCoreMQTTContext
type IoTMQTTContext IoTCoreMQTTContext

// Deprecated: Use IotCoreTLSContext
type IoTTLSContext IoTCoreTLSContext

// IoTCustomAuthorizerResponse represents the expected format of an IoT device gateway authorization response.
// Deprecated: Use IoTCoreCustomAuthorizerResponse. IoTCustomAuthorizerResponse does not correctly model the response schema.
type IoTCustomAuthorizerResponse struct {
	IsAuthenticated          bool     `json:"isAuthenticated"`
	PrincipalID              string   `json:"principalId"`
	DisconnectAfterInSeconds int32    `json:"disconnectAfterInSeconds"`
	RefreshAfterInSeconds    int32    `json:"refreshAfterInSeconds"`
	PolicyDocuments          []string `json:"policyDocuments"`
}
