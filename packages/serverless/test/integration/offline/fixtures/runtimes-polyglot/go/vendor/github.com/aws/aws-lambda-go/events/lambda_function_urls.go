// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package events

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// LambdaFunctionURLRequest contains data coming from the HTTP request to a Lambda Function URL.
type LambdaFunctionURLRequest struct {
	Version               string                          `json:"version"` // Version is expected to be `"2.0"`
	RawPath               string                          `json:"rawPath"`
	RawQueryString        string                          `json:"rawQueryString"`
	Cookies               []string                        `json:"cookies,omitempty"`
	Headers               map[string]string               `json:"headers"`
	QueryStringParameters map[string]string               `json:"queryStringParameters,omitempty"`
	RequestContext        LambdaFunctionURLRequestContext `json:"requestContext"`
	Body                  string                          `json:"body,omitempty"`
	IsBase64Encoded       bool                            `json:"isBase64Encoded"`
}

// LambdaFunctionURLRequestContext contains the information to identify the AWS account and resources invoking the Lambda function.
type LambdaFunctionURLRequestContext struct {
	AccountID    string                                                `json:"accountId"`
	RequestID    string                                                `json:"requestId"`
	Authorizer   *LambdaFunctionURLRequestContextAuthorizerDescription `json:"authorizer,omitempty"`
	APIID        string                                                `json:"apiId"`        // APIID is the Lambda URL ID
	DomainName   string                                                `json:"domainName"`   // DomainName is of the format `"<url-id>.lambda-url.<region>.on.aws"`
	DomainPrefix string                                                `json:"domainPrefix"` // DomainPrefix is the Lambda URL ID
	Time         string                                                `json:"time"`
	TimeEpoch    int64                                                 `json:"timeEpoch"`
	HTTP         LambdaFunctionURLRequestContextHTTPDescription        `json:"http"`
}

// LambdaFunctionURLRequestContextAuthorizerDescription contains authorizer information for the request context.
type LambdaFunctionURLRequestContextAuthorizerDescription struct {
	IAM *LambdaFunctionURLRequestContextAuthorizerIAMDescription `json:"iam,omitempty"`
}

// LambdaFunctionURLRequestContextAuthorizerIAMDescription contains IAM information for the request context.
type LambdaFunctionURLRequestContextAuthorizerIAMDescription struct {
	AccessKey string `json:"accessKey"`
	AccountID string `json:"accountId"`
	CallerID  string `json:"callerId"`
	UserARN   string `json:"userArn"`
	UserID    string `json:"userId"`
}

// LambdaFunctionURLRequestContextHTTPDescription contains HTTP information for the request context.
type LambdaFunctionURLRequestContextHTTPDescription struct {
	Method    string `json:"method"`
	Path      string `json:"path"`
	Protocol  string `json:"protocol"`
	SourceIP  string `json:"sourceIp"`
	UserAgent string `json:"userAgent"`
}

// LambdaFunctionURLResponse configures the HTTP response to be returned by Lambda Function URL for the request.
type LambdaFunctionURLResponse struct {
	StatusCode      int               `json:"statusCode"`
	Headers         map[string]string `json:"headers"`
	Body            string            `json:"body"`
	IsBase64Encoded bool              `json:"isBase64Encoded"`
	Cookies         []string          `json:"cookies"`
}

// LambdaFunctionURLStreamingResponse models the response to a Lambda Function URL when InvokeMode is RESPONSE_STREAM.
// If the InvokeMode of the Function URL is BUFFERED (default), use LambdaFunctionURLResponse instead.
//
// Example:
//
//	lambda.Start(func() (*events.LambdaFunctionURLStreamingResponse, error) {
//		return &events.LambdaFunctionURLStreamingResponse{
//			StatusCode: 200,
//			Headers: map[string]string{
//				"Content-Type": "text/html",
//			},
//			Body: strings.NewReader("<html><body>Hello World!</body></html>"),
//		}, nil
//	})
//
// Note: This response type requires compiling with `-tags lambda.norpc`, or choosing the `provided` or `provided.al2` runtime.
type LambdaFunctionURLStreamingResponse struct {
	prelude *bytes.Buffer

	StatusCode int
	Headers    map[string]string
	Body       io.Reader
	Cookies    []string
}

func (r *LambdaFunctionURLStreamingResponse) Read(p []byte) (n int, err error) {
	if r.prelude == nil {
		if r.StatusCode == 0 {
			r.StatusCode = http.StatusOK
		}
		b, err := json.Marshal(struct {
			StatusCode int               `json:"statusCode"`
			Headers    map[string]string `json:"headers,omitempty"`
			Cookies    []string          `json:"cookies,omitempty"`
		}{
			StatusCode: r.StatusCode,
			Headers:    r.Headers,
			Cookies:    r.Cookies,
		})
		if err != nil {
			return 0, err
		}
		r.prelude = bytes.NewBuffer(append(b, 0, 0, 0, 0, 0, 0, 0, 0))
	}
	if r.prelude.Len() > 0 {
		return r.prelude.Read(p)
	}
	if r.Body == nil {
		return 0, io.EOF
	}
	return r.Body.Read(p)
}

func (r *LambdaFunctionURLStreamingResponse) Close() error {
	if closer, ok := r.Body.(io.ReadCloser); ok {
		return closer.Close()
	}
	return nil
}

func (r *LambdaFunctionURLStreamingResponse) MarshalJSON() ([]byte, error) {
	return nil, errors.New("not json")
}

func (r *LambdaFunctionURLStreamingResponse) ContentType() string {
	return "application/vnd.awslambda.http-integration-response"
}
