package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"

	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
)

func lambdaEnv() map[string]string {
	return map[string]string{
		"AWS_REGION":            "us-east-1",
		"AWS_ACCESS_KEY_ID":     "AKIDEXAMPLE",
		"AWS_SECRET_ACCESS_KEY": "secret-example",
		"AWS_SESSION_TOKEN":     "token-example",
	}
}

// The AWS configuration comes from what Lambda always sets: the Region and the function role's
// credentials. Its HTTP client honours the proxy variables.
func TestFunctionAWSConfigReadsLambdasVariables(t *testing.T) {
	env := lambdaEnv()
	cfg, err := functionAWSConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Region != "us-east-1" {
		t.Fatalf("region %q", cfg.Region)
	}
	creds, err := cfg.Credentials.Retrieve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if creds.AccessKeyID != env["AWS_ACCESS_KEY_ID"] || creds.SecretAccessKey != env["AWS_SECRET_ACCESS_KEY"] || creds.SessionToken != env["AWS_SESSION_TOKEN"] {
		t.Fatal("the credentials differ from the function's")
	}
	client, ok := cfg.HTTPClient.(*awshttp.BuildableClient)
	if !ok {
		t.Fatalf("HTTP client %T", cfg.HTTPClient)
	}
	if client.GetTransport().Proxy == nil {
		t.Fatal("the HTTP client ignores the proxy variables")
	}
	if client.GetTimeout() != 10*time.Second {
		t.Fatalf("timeout %v", client.GetTimeout())
	}
}

// A missing variable is named, never its value or another's.
func TestFunctionAWSConfigNamesWhatIsMissing(t *testing.T) {
	env := lambdaEnv()
	delete(env, "AWS_SECRET_ACCESS_KEY")
	delete(env, "AWS_SESSION_TOKEN")
	_, err := functionAWSConfig(func(k string) string { return env[k] })
	if err == nil || !strings.Contains(err.Error(), "AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN") {
		t.Fatalf("%v", err)
	}
	if strings.Contains(err.Error(), env["AWS_ACCESS_KEY_ID"]) {
		t.Fatal("the error carries a value")
	}
}

// A session whose function credentials are missing runs the deployed code and says why once.
func TestMissingFunctionCredentialsPassThroughAndSayWhy(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-2")
		io.WriteString(w, "{}")
	}))
	defer api.Close()
	port := freePort(t)
	env := map[string]string{
		"SLS_DEV_REAL_RUNTIME_API":   strings.TrimPrefix(api.URL, "http://"),
		"SLS_DEV_BRIDGE_PORT":        strconv.Itoa(port),
		"SLS_DEV_SESSION":            "s_0123456789ab",
		"SLS_DEV_SESSION_KEY":        base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"SLS_DEV_IOT_ENDPOINT":       "abc-ats.iot.us-east-1.amazonaws.com",
		"SLS_DEV_BROKER_ROLE_ARN":    "arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1",
		"SLS_DEV_BROKER_EXTERNAL_ID": strings.Repeat("a", 32),
		"SLS_DEV_OWNER":              "dev@machine",
		"AWS_REGION":                 "us-east-1",
		"AWS_LAMBDA_FUNCTION_NAME":   "svc-dev-api",
	}
	logs := &lines{}
	pr, pw := io.Pipe()
	go func() { pw.CloseWithError(run(func(k string) string { return env[k] }, pw, logs.logf)) }()
	if line, err := bufio.NewReader(pr).ReadString('\n'); err != nil || line != "ready\n" {
		t.Fatalf("%q %v", line, err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/2018-06-01/runtime/invocation/next", port))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-2" {
		t.Fatalf("not passed through: %v", resp.Header)
	}
	got := logs.joined()
	want := "the function's AWS credentials are missing (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN missing); invocations run the deployed code"
	if strings.Count(got, want) != 1 {
		t.Fatalf("logs %q", got)
	}
}

// The bridge links no shared-configuration loader: reading three variables does not need one,
// and its dependency tree would add about 1 MB to every cold start.
func TestTheBridgeDoesNotLinkTheConfigLoader(t *testing.T) {
	out, err := exec.Command("go", "list", "-deps", ".").CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	for _, banned := range []string{"github.com/aws/aws-sdk-go-v2/config", "github.com/aws/aws-sdk-go-v2/service/sso"} {
		for _, dep := range strings.Split(string(out), "\n") {
			if dep == banned || strings.HasPrefix(dep, banned+"/") {
				t.Errorf("the bridge links %s", dep)
			}
		}
	}
}
