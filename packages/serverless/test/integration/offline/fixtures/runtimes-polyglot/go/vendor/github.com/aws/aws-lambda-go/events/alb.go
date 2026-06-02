package events

// ALBTargetGroupRequest contains data originating from the ALB Lambda target group integration
type ALBTargetGroupRequest struct {
	HTTPMethod                      string                       `json:"httpMethod"`
	Path                            string                       `json:"path"`
	QueryStringParameters           map[string]string            `json:"queryStringParameters,omitempty"`
	MultiValueQueryStringParameters map[string][]string          `json:"multiValueQueryStringParameters,omitempty"`
	Headers                         map[string]string            `json:"headers,omitempty"`
	MultiValueHeaders               map[string][]string          `json:"multiValueHeaders,omitempty"`
	RequestContext                  ALBTargetGroupRequestContext `json:"requestContext"`
	IsBase64Encoded                 bool                         `json:"isBase64Encoded"`
	Body                            string                       `json:"body"`
}

// ALBTargetGroupRequestContext contains the information to identify the load balancer invoking the lambda
type ALBTargetGroupRequestContext struct {
	ELB ELBContext `json:"elb"`
}

// ELBContext contains the information to identify the ARN invoking the lambda
type ELBContext struct {
	TargetGroupArn string `json:"targetGroupArn"` //nolint: stylecheck
}

// ALBTargetGroupResponse configures the response to be returned by the ALB Lambda target group for the request
type ALBTargetGroupResponse struct {
	StatusCode        int                 `json:"statusCode"`
	StatusDescription string              `json:"statusDescription"`
	Headers           map[string]string   `json:"headers"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders"`
	Body              string              `json:"body,omitempty"`
	IsBase64Encoded   bool                `json:"isBase64Encoded"`
}
