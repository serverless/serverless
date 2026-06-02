// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved
//
// Runtime API documentation: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-api.html

package lambda

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"io/ioutil" //nolint: staticcheck
	"log"
	"net/http"
	"runtime"
)

const (
	headerAWSRequestID       = "Lambda-Runtime-Aws-Request-Id"
	headerDeadlineMS         = "Lambda-Runtime-Deadline-Ms"
	headerTraceID            = "Lambda-Runtime-Trace-Id"
	headerCognitoIdentity    = "Lambda-Runtime-Cognito-Identity"
	headerClientContext      = "Lambda-Runtime-Client-Context"
	headerInvokedFunctionARN = "Lambda-Runtime-Invoked-Function-Arn"
	trailerLambdaErrorType   = "Lambda-Runtime-Function-Error-Type"
	trailerLambdaErrorBody   = "Lambda-Runtime-Function-Error-Body"
	contentTypeJSON          = "application/json"
	contentTypeBytes         = "application/octet-stream"
	apiVersion               = "2018-06-01"
)

type runtimeAPIClient struct {
	baseURL    string
	userAgent  string
	httpClient *http.Client
	buffer     *bytes.Buffer
}

func newRuntimeAPIClient(address string) *runtimeAPIClient {
	client := &http.Client{
		Timeout: 0, // connections to the runtime API are never expected to time out
	}
	endpoint := "http://" + address + "/" + apiVersion + "/runtime/invocation/"
	userAgent := "aws-lambda-go/" + runtime.Version()
	return &runtimeAPIClient{endpoint, userAgent, client, bytes.NewBuffer(nil)}
}

type invoke struct {
	id      string
	payload []byte
	headers http.Header
	client  *runtimeAPIClient
}

// success sends the response payload for an in-progress invocation.
// Notes:
//   - An invoke is not complete until next() is called again!
func (i *invoke) success(body io.Reader, contentType string) error {
	url := i.client.baseURL + i.id + "/response"
	return i.client.post(url, body, contentType)
}

// failure sends the payload to the Runtime API. This marks the function's invoke as a failure.
// Notes:
//   - The execution of the function process continues, and is billed, until next() is called again!
//   - A Lambda Function continues to be re-used for future invokes even after a failure.
//     If the error is fatal (panic, unrecoverable state), exit the process immediately after calling failure()
func (i *invoke) failure(body io.Reader, contentType string) error {
	url := i.client.baseURL + i.id + "/error"
	return i.client.post(url, body, contentType)
}

// next connects to the Runtime API and waits for a new invoke Request to be available.
// Note: After a call to Done() or Error() has been made, a call to next() will complete the in-flight invoke.
func (c *runtimeAPIClient) next() (*invoke, error) {
	url := c.baseURL + "next"
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to construct GET request to %s: %v", url, err)
	}
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get the next invoke: %v", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.Printf("runtime API client failed to close %s response body: %v", url, err)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to GET %s: got unexpected status code: %d", url, resp.StatusCode)
	}

	c.buffer.Reset()
	_, err = c.buffer.ReadFrom(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read the invoke payload: %v", err)
	}

	return &invoke{
		id:      resp.Header.Get(headerAWSRequestID),
		payload: c.buffer.Bytes(),
		headers: resp.Header,
		client:  c,
	}, nil
}

func (c *runtimeAPIClient) post(url string, body io.Reader, contentType string) error {
	b := newErrorCapturingReader(body)
	req, err := http.NewRequest(http.MethodPost, url, b)
	if err != nil {
		return fmt.Errorf("failed to construct POST request to %s: %v", url, err)
	}
	req.Trailer = b.Trailer
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Content-Type", contentType)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to POST to %s: %v", url, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.Printf("runtime API client failed to close %s response body: %v", url, err)
		}
	}()
	if resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("failed to POST to %s: got unexpected status code: %d", url, resp.StatusCode)
	}

	_, err = io.Copy(ioutil.Discard, resp.Body)
	if err != nil {
		return fmt.Errorf("something went wrong reading the POST response from %s: %v", url, err)
	}

	return nil
}

func newErrorCapturingReader(r io.Reader) *errorCapturingReader {
	trailer := http.Header{
		trailerLambdaErrorType: nil,
		trailerLambdaErrorBody: nil,
	}
	return &errorCapturingReader{r, trailer}
}

type errorCapturingReader struct {
	reader  io.Reader
	Trailer http.Header
}

func (r *errorCapturingReader) Read(p []byte) (int, error) {
	if r.reader == nil {
		return 0, io.EOF
	}
	n, err := r.reader.Read(p)
	if err != nil && err != io.EOF {
		lambdaErr := lambdaErrorResponse(err)
		r.Trailer.Set(trailerLambdaErrorType, lambdaErr.Type)
		r.Trailer.Set(trailerLambdaErrorBody, base64.StdEncoding.EncodeToString(safeMarshal(lambdaErr)))
		return 0, io.EOF
	}
	return n, err
}
