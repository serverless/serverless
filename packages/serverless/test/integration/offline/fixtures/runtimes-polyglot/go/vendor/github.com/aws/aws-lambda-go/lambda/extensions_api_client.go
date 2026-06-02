package lambda

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil" //nolint: staticcheck
	"net/http"
)

const (
	headerExtensionName       = "Lambda-Extension-Name"
	headerExtensionIdentifier = "Lambda-Extension-Identifier"
	extensionAPIVersion       = "2020-01-01"
)

type extensionAPIEventType string

const (
	extensionInvokeEvent   extensionAPIEventType = "INVOKE"   //nolint:deadcode,unused,varcheck
	extensionShutdownEvent extensionAPIEventType = "SHUTDOWN" //nolint:deadcode,unused,varcheck
)

type extensionAPIClient struct {
	baseURL    string
	httpClient *http.Client
}

func newExtensionAPIClient(address string) *extensionAPIClient {
	client := &http.Client{
		Timeout: 0, // connections to the extensions API are never expected to time out
	}
	endpoint := "http://" + address + "/" + extensionAPIVersion + "/extension/"
	return &extensionAPIClient{
		baseURL:    endpoint,
		httpClient: client,
	}
}

func (c *extensionAPIClient) register(name string, events ...extensionAPIEventType) (string, error) {
	url := c.baseURL + "register"
	body, _ := json.Marshal(struct {
		Events []extensionAPIEventType `json:"events"`
	}{
		Events: events,
	})

	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Add(headerExtensionName, name)
	res, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to register extension: %v", err)
	}
	defer res.Body.Close()
	_, _ = io.Copy(ioutil.Discard, res.Body)

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to register extension, got response status: %d %s", res.StatusCode, http.StatusText(res.StatusCode))
	}

	return res.Header.Get(headerExtensionIdentifier), nil
}

type extensionEventResponse struct {
	EventType extensionAPIEventType
	// ... the rest not implemented
}

func (c *extensionAPIClient) next(id string) (response extensionEventResponse, err error) {
	url := c.baseURL + "event/next"

	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Add(headerExtensionIdentifier, id)
	res, err := c.httpClient.Do(req)
	if err != nil {
		err = fmt.Errorf("failed to get extension event: %v", err)
		return
	}
	defer res.Body.Close()
	_, _ = io.Copy(ioutil.Discard, res.Body)

	if res.StatusCode != http.StatusOK {
		err = fmt.Errorf("failed to register extension, got response status: %d %s", res.StatusCode, http.StatusText(res.StatusCode))
		return
	}

	err = json.NewDecoder(res.Body).Decode(&response)
	return
}
