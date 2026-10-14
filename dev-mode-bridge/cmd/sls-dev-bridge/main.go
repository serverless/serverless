// Command sls-dev-bridge is started by /opt/sls-dev-wrapper in a Lambda execution environment.
// It prints "ready" on stdout once it listens, then proxies the Lambda Runtime API and relays
// invocations to the developer's machine while the Dev Mode session is there.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/credentials"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
	"github.com/serverless/serverless/dev-mode-bridge/internal/bridge"
	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws"
	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

func main() {
	logger := newLogger(os.Stderr)
	if err := run(os.Getenv, os.Stdout, logger.Printf); err != nil {
		logger.Printf("%v", err)
		os.Exit(1)
	}
}

// newLogger configures the standard logger, which net/http and httputil fall back to when their
// ErrorLog is nil, so every line the bridge writes to w carries the bridge prefix.
func newLogger(w io.Writer) *log.Logger {
	log.SetOutput(w)
	log.SetPrefix("[sls-dev-bridge] ")
	log.SetFlags(0)
	return log.Default()
}

func run(getenv func(string) string, ready io.WriteCloser, logf bridge.Logf) error {
	cfg, err := bridge.ConfigFromEnv(getenv)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		return err
	}
	target := &url.URL{Scheme: "http", Host: cfg.RealRuntimeAPI}
	relay := newRelay(getenv, target, logf)
	// A nil *Relay inside the interface would not compare equal to nil.
	var relayer bridge.Relayer
	if relay != nil {
		relayer = relay
	}
	handler := bridge.NewHandler(target, relayer, logf)
	logf("listening on %s for Runtime API %s", cfg.ListenAddr, cfg.RealRuntimeAPI)
	// A wrapper that cannot read "ready" runs the runtime against the real Runtime API; this
	// process must not stay behind holding the port.
	if _, err := fmt.Fprintln(ready, "ready"); err != nil {
		ln.Close()
		return fmt.Errorf("could not tell the wrapper the bridge is ready: %w", err)
	}
	if err := ready.Close(); err != nil {
		ln.Close()
		return fmt.Errorf("could not tell the wrapper the bridge is ready: %w", err)
	}
	// Connecting starts after "ready", in the background: the runtime's init never waits for it.
	if relay != nil {
		relay.Start()
	}
	return (&http.Server{Handler: handler}).Serve(ln)
}

// lambdaCredentials are the variables Lambda sets for the function role's credentials.
var lambdaCredentials = []string{"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"}

// functionAWSConfig is the AWS configuration of the function's own role, from what Lambda always
// sets: AWS_REGION and the role's credentials. No shared-configuration loader: reading three
// variables does not need one, and its dependency tree would make every cold start slower. AWS
// calls honour the function's proxy variables. Errors name variables, never their values.
func functionAWSConfig(getenv func(string) string) (aws.Config, error) {
	var missing []string
	for _, name := range append([]string{"AWS_REGION"}, lambdaCredentials...) {
		if getenv(name) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return aws.Config{}, fmt.Errorf("the function's AWS credentials are missing (%s missing)", strings.Join(missing, ", "))
	}
	return aws.Config{
		Region: getenv("AWS_REGION"),
		Credentials: credentials.NewStaticCredentialsProvider(
			getenv("AWS_ACCESS_KEY_ID"), getenv("AWS_SECRET_ACCESS_KEY"), getenv("AWS_SESSION_TOKEN")),
		HTTPClient: awshttp.NewBuildableClient().
			WithTimeout(10 * time.Second).
			WithTransportOptions(func(t *http.Transport) { t.Proxy = http.ProxyFromEnvironment }),
	}, nil
}

// newRelay returns nil (every invocation runs the deployed code) when the function carries no
// usable Dev Mode session; it never fails the bridge. It only reads variables and builds clients:
// nothing is sent to AWS before "ready".
func newRelay(getenv func(string) string, target *url.URL, logf bridge.Logf) *bridge.Relay {
	rc, ok, err := bridge.RelayConfigFromEnv(getenv)
	if err != nil {
		logf("%v; invocations run the deployed code", err)
		return nil
	}
	if !ok {
		return nil
	}
	own, err := functionAWSConfig(getenv)
	if err != nil {
		logf("%v; invocations run the deployed code", err)
		return nil
	}
	envID := make([]byte, 6)
	if _, err := rand.Read(envID); err != nil {
		logf("could not pick an environment id (%v); invocations run the deployed code", err)
		return nil
	}
	environment := "e" + hex.EncodeToString(envID)
	scope, err := awsauth.ScopeFromRoleARN(rc.BrokerRoleARN, rc.Region, rc.Session, environment)
	if err != nil {
		logf("%v; invocations run the deployed code", err)
		return nil
	}
	// The broker session's credentials: assumed on first use, after "ready", and replaced before
	// they expire.
	provider, err := awsauth.BrokerCredentials(awsauth.NewSTS(own), rc.BrokerRoleARN, rc.ExternalID, scope)
	if err != nil {
		logf("%v; invocations run the deployed code", err)
		return nil
	}
	brokerCfg := own.Copy()
	brokerCfg.Credentials = provider
	messenger := awsauth.NewDirectMessenger(brokerCfg, rc.IoTEndpoint)
	// AWS calls (STS, AWS IoT Core, S3) honour the function's proxy variables, as its own HTTP
	// clients do; the Runtime API (Upstream) never goes through a proxy.
	plain := &http.Client{Timeout: 30 * time.Second}
	return bridge.NewRelay(bridge.RelayDeps{
		Session: bridge.Session{
			ID:           rc.Session,
			Key:          rc.Key,
			Owner:        rc.Owner,
			FunctionName: rc.FunctionName,
			Environment:  environment,
		},
		Dial: func(ctx context.Context, onMessage func(mqttws.Message), onLost func(error)) (bridge.BrokerConn, error) {
			conn, err := mqttws.Dial(ctx, mqttws.Options{
				URL: func(ctx context.Context) (string, error) {
					creds, err := provider.Retrieve(ctx)
					if err != nil {
						return "", err
					}
					return awsauth.PresignIoT(ctx, creds, rc.IoTEndpoint, rc.Region, time.Now())
				},
				ClientID:      protocol.BridgeClientID(rc.Session, environment),
				Subscriptions: []string{protocol.DownTopic(rc.Session, environment), protocol.GoneTopic(rc.Session)},
				KeepAlive:     30,
				HTTPClient:    plain,
				PacketTimeout: 2 * time.Second,
				OnMessage:     onMessage,
				OnLost:        onLost,
			})
			if err != nil {
				// A nil *mqttws.Conn inside the interface would not compare equal to nil.
				return nil, err
			}
			return conn, nil
		},
		Retryable: awsauth.Retryable,
		Ping: func(ctx context.Context) (awsauth.Liveness, error) {
			return messenger.Ping(ctx, protocol.LaptopClientID(rc.Session), protocol.PingTopic(rc.Session))
		},
		HTTP:        plain,
		Upstream:    bridge.NewUpstream(&http.Client{Transport: &http.Transport{Proxy: nil}}, target),
		Logf:        logf,
		Environment: func() map[string]string { return bridge.FunctionEnvironment(nil) },
		Timing:      bridge.Defaults(),
	})
}
