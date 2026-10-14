package bridge

import (
	"encoding/base64"
	"strings"
	"testing"
)

func relayEnv() map[string]string {
	return map[string]string{
		"SLS_DEV_SESSION":            "s_0123456789ab",
		"SLS_DEV_SESSION_KEY":        base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"SLS_DEV_IOT_ENDPOINT":       "abc-ats.iot.us-east-1.amazonaws.com",
		"SLS_DEV_BROKER_ROLE_ARN":    "arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1",
		"SLS_DEV_BROKER_EXTERNAL_ID": strings.Repeat("a", 32),
		"SLS_DEV_OWNER":              "dev@machine",
		"AWS_REGION":                 "us-east-1",
		"AWS_LAMBDA_FUNCTION_NAME":   "svc-dev-api",
	}
}

func TestRelayConfigFromEnvReadsTheSession(t *testing.T) {
	c, ok, err := RelayConfigFromEnv(env(relayEnv()))
	if err != nil || !ok {
		t.Fatalf("%v %v", ok, err)
	}
	if c.Session != "s_0123456789ab" || len(c.Key) != 32 || c.FunctionName != "svc-dev-api" || c.Owner != "dev@machine" {
		t.Fatalf("session %q key %d bytes function %q owner %q", c.Session, len(c.Key), c.FunctionName, c.Owner)
	}
}

func TestNoSessionMeansNoRelay(t *testing.T) {
	if _, ok, err := RelayConfigFromEnv(env(map[string]string{"AWS_REGION": "us-east-1"})); ok || err != nil {
		t.Fatalf("%v %v", ok, err)
	}
}

func TestAnIncompleteSessionNamesWhatIsMissing(t *testing.T) {
	m := relayEnv()
	delete(m, "SLS_DEV_IOT_ENDPOINT")
	delete(m, "SLS_DEV_BROKER_EXTERNAL_ID")
	_, ok, err := RelayConfigFromEnv(env(m))
	if ok || err == nil || !strings.Contains(err.Error(), "SLS_DEV_BROKER_EXTERNAL_ID, SLS_DEV_IOT_ENDPOINT missing") {
		t.Fatalf("%v %v", ok, err)
	}
	m = relayEnv()
	m["SLS_DEV_SESSION_KEY"] = "short"
	if _, ok, err := RelayConfigFromEnv(env(m)); ok || err == nil {
		t.Fatalf("a bad key was accepted")
	}
}

// Neither the session key nor the ExternalId ever appears in an error.
func TestRelayConfigErrorsNeverCarryTheSecrets(t *testing.T) {
	const badKey = "c2VjcmV0LWtleS10aGF0LWlzLXRvby1zaG9ydA=="
	incomplete := relayEnv()
	incomplete["SLS_DEV_SESSION_KEY"] = badKey
	delete(incomplete, "SLS_DEV_IOT_ENDPOINT")
	shortKey := relayEnv()
	shortKey["SLS_DEV_SESSION_KEY"] = badKey
	for name, m := range map[string]map[string]string{"incomplete": incomplete, "short key": shortKey} {
		_, _, err := RelayConfigFromEnv(env(m))
		if err == nil {
			t.Fatalf("%s: no error", name)
		}
		if strings.Contains(err.Error(), badKey) || strings.Contains(err.Error(), m["SLS_DEV_BROKER_EXTERNAL_ID"]) {
			t.Fatalf("%s: the error carries a secret (%d bytes)", name, len(err.Error()))
		}
	}
}

func TestTheFunctionEnvironmentLeavesOutTheBridgesOwnAndTheSecrets(t *testing.T) {
	got := FunctionEnvironment(func() []string {
		return []string{
			"AWS_REGION=us-east-1", "GREETING=a=b", "SLS_DEV_SESSION_KEY=k", "SLS_DEV_BROKER_EXTERNAL_ID=x",
			"SLS_DEV_REAL_RUNTIME_API=169.254.100.1:9001", "SLS_DEV_BRIDGE_PORT=9140", "AWS_LAMBDA_RUNTIME_API=127.0.0.1:9140",
			"SLS_DEV_SESSION=s_1", "AWS_ACCESS_KEY_ID=AKID",
		}
	})
	want := map[string]string{"AWS_REGION": "us-east-1", "GREETING": "a=b", "SLS_DEV_SESSION": "s_1", "AWS_ACCESS_KEY_ID": "AKID"}
	if len(got) != len(want) {
		t.Fatalf("%d variables, want %d", len(got), len(want))
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("%s differs", k)
		}
	}
}
