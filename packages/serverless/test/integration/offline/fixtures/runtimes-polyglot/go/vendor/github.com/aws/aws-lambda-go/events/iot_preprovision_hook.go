package events

// IoTPreProvisionHookRequest contains the request parameters for the IoT Pre-Provisioning Hook.
// See https://docs.aws.amazon.com/iot/latest/developerguide/pre-provisioning-hook.html
type IoTPreProvisionHookRequest struct {
	ClaimCertificateID string            `json:"claimCertificateId"`
	CertificateID      string            `json:"certificateId"`
	CertificatePEM     string            `json:"certificatePem"`
	TemplateARN        string            `json:"templateArn"`
	ClientID           string            `json:"clientId"`
	Parameters         map[string]string `json:"parameters"`
}

// IoTPreProvisionHookResponse contains the response parameters for the IoT Pre-Provisioning Hook.
// See https://docs.aws.amazon.com/iot/latest/developerguide/pre-provisioning-hook.html
type IoTPreProvisionHookResponse struct {
	AllowProvisioning  bool              `json:"allowProvisioning"`
	ParameterOverrides map[string]string `json:"parameterOverrides"`
}
