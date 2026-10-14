// Package bridge is the Lambda-side half of Serverless Framework Dev Mode: a Lambda Runtime API
// proxy that /opt/sls-dev-wrapper starts before the function's runtime, and the relay that hands
// invocations to the developer's machine.
package bridge

import (
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// DefaultPort is where the bridge listens when the wrapper does not choose a port.
const DefaultPort = 9140

// Config is read from the environment the wrapper prepares.
type Config struct {
	// RealRuntimeAPI is the host:port Lambda gave the runtime. Never assume 127.0.0.1:9001:
	// 169.254.100.1:9001 is common.
	RealRuntimeAPI string
	// ListenAddr is the loopback address the runtime is pointed at.
	ListenAddr string
}

// ConfigFromEnv reads SLS_DEV_REAL_RUNTIME_API and SLS_DEV_BRIDGE_PORT.
func ConfigFromEnv(getenv func(string) string) (Config, error) {
	real := getenv("SLS_DEV_REAL_RUNTIME_API")
	if real == "" {
		return Config{}, errors.New("SLS_DEV_REAL_RUNTIME_API is empty")
	}
	port := DefaultPort
	if raw := getenv("SLS_DEV_BRIDGE_PORT"); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil || p < 1 || p > 65535 {
			return Config{}, fmt.Errorf("SLS_DEV_BRIDGE_PORT %q is not a TCP port", raw)
		}
		port = p
	}
	return Config{RealRuntimeAPI: real, ListenAddr: fmt.Sprintf("127.0.0.1:%d", port)}, nil
}

// RelayConfig is the Dev Mode session the CLI attached this function to.
type RelayConfig struct {
	Session       string
	Key           []byte
	IoTEndpoint   string
	BrokerRoleARN string
	ExternalID    string
	Owner         string
	Region        string
	FunctionName  string
}

// RelayConfigFromEnv reads the session the CLI wrote into the function's configuration. ok is
// false when there is none (every invocation then runs the deployed code); err says why a session
// that is there cannot be used. Errors name variables, never their values.
func RelayConfigFromEnv(getenv func(string) string) (RelayConfig, bool, error) {
	c := RelayConfig{
		Session:       getenv("SLS_DEV_SESSION"),
		IoTEndpoint:   getenv("SLS_DEV_IOT_ENDPOINT"),
		BrokerRoleARN: getenv("SLS_DEV_BROKER_ROLE_ARN"),
		ExternalID:    getenv("SLS_DEV_BROKER_EXTERNAL_ID"),
		Owner:         getenv("SLS_DEV_OWNER"),
		Region:        getenv("AWS_REGION"),
		FunctionName:  getenv("AWS_LAMBDA_FUNCTION_NAME"),
	}
	rawKey := getenv("SLS_DEV_SESSION_KEY")
	if c.Session == "" && rawKey == "" {
		return RelayConfig{}, false, nil
	}
	var missing []string
	for name, value := range map[string]string{
		"SLS_DEV_SESSION": c.Session, "SLS_DEV_SESSION_KEY": rawKey, "SLS_DEV_IOT_ENDPOINT": c.IoTEndpoint,
		"SLS_DEV_BROKER_ROLE_ARN": c.BrokerRoleARN, "SLS_DEV_BROKER_EXTERNAL_ID": c.ExternalID,
		"AWS_REGION": c.Region, "AWS_LAMBDA_FUNCTION_NAME": c.FunctionName,
	} {
		if value == "" {
			missing = append(missing, name)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		return RelayConfig{}, false, fmt.Errorf("the Dev Mode session is incomplete (%s missing)", strings.Join(missing, ", "))
	}
	key, err := protocol.DecodeKey(rawKey)
	if err != nil {
		return RelayConfig{}, false, fmt.Errorf("SLS_DEV_SESSION_KEY: %w", err)
	}
	c.Key = key
	return c, true, nil
}

// notForwarded are the variables the bridge never sends to the developer's machine: the wrapper's
// own, the real Runtime API address, and the session's secrets.
var notForwarded = map[string]bool{
	"SLS_DEV_REAL_RUNTIME_API":   true,
	"SLS_DEV_BRIDGE_PORT":        true,
	"AWS_LAMBDA_RUNTIME_API":     true,
	"SLS_DEV_SESSION_KEY":        true,
	"SLS_DEV_BROKER_EXTERNAL_ID": true,
}

// FunctionEnvironment is this execution environment's variables as the handler would see them,
// for the developer's machine: the deployed configuration plus what Lambda sets (the role's
// credentials included). A nil environ reads the process environment.
func FunctionEnvironment(environ func() []string) map[string]string {
	if environ == nil {
		environ = os.Environ
	}
	out := map[string]string{}
	for _, entry := range environ() {
		name, value, ok := strings.Cut(entry, "=")
		if !ok || notForwarded[name] {
			continue
		}
		out[name] = value
	}
	return out
}
