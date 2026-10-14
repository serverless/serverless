package mqttws

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
)

// TestLiveAWSIoTCore connects to the real AWS IoT Core with the caller's credentials, the way the
// bridge does with the broker's: SigV4 WebSocket URL (token appended), MQTT 5, subscribe, publish
// a full-size message to itself, through the default HTTP client (which honours the proxy
// variables). It runs only when SLS_DEV_LIVE_IOT_ENDPOINT is set.
func TestLiveAWSIoTCore(t *testing.T) {
	endpoint := os.Getenv("SLS_DEV_LIVE_IOT_ENDPOINT")
	if endpoint == "" {
		t.Skip("set SLS_DEV_LIVE_IOT_ENDPOINT and AWS credentials to run against AWS IoT Core")
	}
	creds := aws.Credentials{
		AccessKeyID:     os.Getenv("AWS_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
		SessionToken:    os.Getenv("AWS_SESSION_TOKEN"),
	}
	region := os.Getenv("AWS_REGION")
	suffix := make([]byte, 4)
	_, _ = rand.Read(suffix)
	session := "live" + hex.EncodeToString(suffix)
	topic := "sls-dev/" + session + "/up"
	in := make(chan Message, 4)
	lost := make(chan error, 1)
	started := time.Now()
	c, err := Dial(context.Background(), Options{
		URL: func(ctx context.Context) (string, error) {
			return awsauth.PresignIoT(ctx, creds, endpoint, region, time.Now())
		},
		ClientID:      "sls-dev-" + session + "-cli",
		Subscriptions: []string{topic},
		PacketTimeout: 5 * time.Second,
		OnMessage:     func(m Message) { in <- m },
		OnLost:        func(err error) { lost <- err },
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()
	t.Logf("connected and subscribed in %v", time.Since(started).Round(time.Millisecond))
	payload := bytes.Repeat([]byte{7}, 129024)
	sent := time.Now()
	if err := c.Publish(context.Background(), topic, payload, 3); err != nil {
		t.Fatalf("publish: %v", err)
	}
	select {
	case m := <-in:
		if m.Topic != topic || !bytes.Equal(m.Payload, payload) {
			t.Fatalf("received %d bytes on another topic or changed", len(m.Payload))
		}
		t.Logf("round trip of 129024 bytes in %v", time.Since(sent).Round(time.Millisecond))
	case err := <-lost:
		t.Fatalf("connection lost: %v", err)
	case <-time.After(15 * time.Second):
		t.Fatal("nothing received within 15 s")
	}
	c.Close()
	select {
	case err := <-lost:
		t.Fatalf("Close reported a loss: %v", err)
	default:
	}
}
