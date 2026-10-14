package bridge

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// MaxObjectBytes bounds an S3 payload the bridge downloads (Lambda's limit is 6 MB, plus sealing).
const MaxObjectBytes = 6*1024*1024 + 64*1024

// errObjectTooLarge: the object holds more than Lambda would take.
var errObjectTooLarge = errors.New("the payload in S3 is larger than Lambda allows")

// s3Client moves payloads above one MQTT message through the deployment bucket, using only the
// presigned URLs the developer's machine signed: the bridge has no S3 permission of its own. Every
// object is a sealed frame whose "topic" is s3/<key>, so an object cannot be swapped for another.
// The URLs carry credentials: errors from here go through clean before anyone sees them.
type s3Client struct {
	http *http.Client
	key  []byte
}

func objectTopic(key string) string { return "s3/" + key }

// put seals body and uploads it with the URL's signed headers; it returns the object's version
// id (empty for an unversioned bucket), which the developer's machine needs to delete it.
func (c s3Client) put(ctx context.Context, u protocol.Upload, body []byte) (string, error) {
	sealed, err := protocol.NewSealer(c.key).Seal(objectTopic(u.Key), protocol.Header{Kind: protocol.KindPayload}, body)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u.URL, bytes.NewReader(sealed))
	if err != nil {
		return "", err
	}
	for name, value := range u.Headers {
		req.Header.Set(name, value)
	}
	req.ContentLength = int64(len(sealed))
	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("S3 answered %d to the upload", resp.StatusCode)
	}
	return resp.Header.Get("x-amz-version-id"), nil
}

// get downloads, then deletes the object and its version (the developer's machine signed the
// delete for exactly that version), then opens it. A failed delete is left to the session's
// sweep. An object larger than MaxObjectBytes is errObjectTooLarge, never cut short.
func (c s3Client) get(ctx context.Context, o protocol.S3Object) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, o.Get, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxObjectBytes+1))
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("S3 answered %d to the download", resp.StatusCode)
	}
	if o.Delete != "" {
		if del, err := http.NewRequestWithContext(ctx, http.MethodDelete, o.Delete, nil); err == nil {
			if resp, err := c.http.Do(del); err == nil {
				_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
				resp.Body.Close()
			}
		}
	}
	if len(data) > MaxObjectBytes {
		return nil, errObjectTooLarge
	}
	_, _, plaintext, err := protocol.OpenRaw(c.key, objectTopic(o.Key), data)
	if err != nil {
		return nil, fmt.Errorf("the downloaded payload is not this session's: %w", err)
	}
	_, body, err := protocol.DecodeFrame(plaintext)
	return body, err
}
