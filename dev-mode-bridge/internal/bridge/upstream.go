package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
)

// Upstream posts the results of relayed invocations to the real Runtime API, the way a runtime
// would: /response with the content type, /error with Lambda-Runtime-Function-Error-Type, or a
// streamed /response whose error travels in trailers.
type Upstream struct {
	client *http.Client
	base   string // http://<real Runtime API>/2018-06-01/runtime
}

// NewUpstream posts to the Runtime API at target with client, which must not use a proxy.
func NewUpstream(client *http.Client, target *url.URL) Upstream {
	return Upstream{client: client, base: target.String() + "/2018-06-01/runtime"}
}

func (u Upstream) post(ctx context.Context, path string, header http.Header, body []byte) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.base+path, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	for name, values := range header {
		req.Header[name] = values
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return 0, err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
	resp.Body.Close()
	return resp.StatusCode, nil
}

func (u Upstream) response(ctx context.Context, id, contentType string, body []byte) (int, error) {
	if contentType == "" {
		contentType = "application/json"
	}
	return u.post(ctx, "/invocation/"+url.PathEscape(id)+"/response", http.Header{"Content-Type": {contentType}}, body)
}

func (u Upstream) error(ctx context.Context, id, errorType string, body []byte) (int, error) {
	return u.post(ctx, "/invocation/"+url.PathEscape(id)+"/error", http.Header{
		"Content-Type":                       {"application/json"},
		"Lambda-Runtime-Function-Error-Type": {errorType},
	}, body)
}

// errorBody is the JSON body Lambda's runtimes post for an error. message must already be clean
// (see clean): JSON escaping would hide a quoted secret from redaction.
func errorBody(errorType, message string) []byte {
	body, _ := json.Marshal(map[string]any{"errorType": errorType, "errorMessage": message, "trace": []string{}})
	return body
}

// streamPost is one streamed /response: the trailers are declared before the body and set after
// it, which is when net/http sends them.
type streamPost struct {
	req      *http.Request
	pipe     *io.PipeWriter
	done     chan error
	finished sync.Once
	result   error
}

func (u Upstream) stream(ctx context.Context, id, contentType string) *streamPost {
	pr, pw := io.Pipe()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u.base+"/invocation/"+url.PathEscape(id)+"/response", pr)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Lambda-Runtime-Function-Response-Mode", "streaming")
	req.Trailer = http.Header{"Lambda-Runtime-Function-Error-Type": nil, "Lambda-Runtime-Function-Error-Body": nil}
	s := &streamPost{req: req, pipe: pw, done: make(chan error, 1)}
	go func() {
		var err error
		defer func() {
			if p := recover(); p != nil {
				err = fmt.Errorf("the streamed post failed: %s", cleanText(p))
			}
			// A request that failed early leaves the writer blocked; unblock it.
			pr.CloseWithError(io.ErrClosedPipe)
			s.done <- err
		}()
		resp, doErr := u.client.Do(req)
		if doErr != nil {
			err = doErr
			return
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			err = fmt.Errorf("the Runtime API answered %d", resp.StatusCode)
		}
	}()
	return s
}

func (s *streamPost) Write(p []byte) error {
	_, err := s.pipe.Write(p)
	return err
}

// Finish ends the stream; a non-empty errorType becomes the error trailers (errorBody is the
// base64 error JSON, as Lambda expects it). It returns once the Runtime API answered; only the
// first call ends the stream.
func (s *streamPost) Finish(errorType, errorBody string) error {
	s.finished.Do(func() {
		// net/http reads the trailer map when it writes the request headers, before the first
		// read of the body: an empty write returns only once the body is being read, so setting
		// the trailers below cannot race with that (a stream that wrote nothing would otherwise).
		_, _ = s.pipe.Write(nil)
		if errorType != "" {
			s.req.Trailer.Set("Lambda-Runtime-Function-Error-Type", errorType)
			s.req.Trailer.Set("Lambda-Runtime-Function-Error-Body", errorBody)
		}
		_ = s.pipe.Close()
		s.result = <-s.done
	})
	return s.result
}
