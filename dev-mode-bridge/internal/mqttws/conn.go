// Package mqttws is the bridge's AWS IoT Core connection: MQTT 5 (eclipse/paho.golang's paho
// package) over a WebSocket (coder/websocket). One connection per execution environment, QoS 1
// only, a CONNACK, SUBACK or PUBACK reason code at or above 0x80 is an error, and a connection is
// never trusted to be alive: callers redial after an error, a failed publish or a long idle time.
//
// The URL a connection dials is presigned and carries credentials, so no error this package
// returns or reports carries it.
package mqttws

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/eclipse/paho.golang/paho"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
)

// ReadLimit is the largest WebSocket message read: AWS IoT Core sends MQTT packets of up to
// 149,504 bytes, and the WebSocket library's default limit is 32,768.
const ReadLimit = 256 * 1024

const (
	defaultKeepAlive     = 30
	defaultPacketTimeout = 5 * time.Second
)

// Message is one PUBLISH received on a subscribed topic.
type Message struct {
	Topic   string
	Payload []byte
}

// Options configure Dial.
type Options struct {
	// URL returns the URL to dial; AWS IoT Core needs a freshly signed one for every connect.
	URL           func(ctx context.Context) (string, error)
	ClientID      string
	Subscriptions []string
	// KeepAlive is the MQTT keep alive in seconds (default 30): a PINGREQ the broker leaves
	// unanswered for that long ends the connection.
	KeepAlive uint16
	// HTTPClient makes the WebSocket handshake. The default honours the proxy variables
	// (HTTPS_PROXY, NO_PROXY), as the function's own HTTP clients do.
	HTTPClient *http.Client
	// PacketTimeout bounds the WebSocket handshake and every CONNECT, SUBSCRIBE and PUBLISH round
	// trip (default 5 s). A single write that cannot complete within it ends the connection.
	PacketTimeout time.Duration
	// OnMessage receives every inbound PUBLISH; it must not block, nor call Close.
	OnMessage func(Message)
	// OnLost is called once when the connection ends for any reason but Close; it may call Close.
	OnLost func(error)
}

// ReasonError is an MQTT reason code at or above 0x80 from the broker: in the CONNACK, SUBACK or
// PUBACK answering the Packet named, or in a DISCONNECT the broker sent.
type ReasonError struct {
	Packet string // CONNECT, SUBSCRIBE, PUBLISH or DISCONNECT
	Code   byte
}

func (e ReasonError) Error() string {
	if e.Packet == "DISCONNECT" {
		return fmt.Sprintf("AWS IoT Core ended the connection (reason code 0x%02X)", e.Code)
	}
	return fmt.Sprintf("AWS IoT Core refused the %s (reason code 0x%02X)", e.Packet, e.Code)
}

// HandshakeError is a WebSocket upgrade the endpoint answered with Status instead of 101 (AWS IoT
// Core answers 401 or 403 to a connection it does not authorize). Its text is the redacted
// handshake error.
type HandshakeError struct {
	Status int
	Err    error
}

func (e HandshakeError) Error() string { return "connecting to AWS IoT Core: " + e.Err.Error() }
func (e HandshakeError) Unwrap() error { return e.Err }

// HTTPStatusCode is the status the endpoint answered. awsauth.Retryable reads it: a 5xx or a 429
// is a failure that may pass, which the bridge tries again with its backoff.
func (e HandshakeError) HTTPStatusCode() int { return e.Status }

// NotAuthorized says whether err is the broker's "not authorized" (0x87).
func NotAuthorized(err error) bool {
	var r ReasonError
	return errors.As(err, &r) && r.Code == 0x87
}

// defaultHTTPClient is the WebSocket handshake's client unless Options.HTTPClient is set.
var defaultHTTPClient = func() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = http.ProxyFromEnvironment
	return &http.Client{Transport: transport}
}()

// Conn is one connected, subscribed client.
type Conn struct {
	client *paho.Client
	socket *socket

	mu     sync.Mutex
	ready  bool  // Dial returned the connection: from then on a loss is reported
	closed bool  // Close was called: from then on nothing is reported
	ended  error // the first loss
	onLost func(error)
}

// Dial connects, subscribes and returns the connection; any failure closes what was opened.
func Dial(ctx context.Context, o Options) (*Conn, error) {
	if o.URL == nil {
		return nil, errors.New("mqttws: Options.URL is required")
	}
	if o.KeepAlive == 0 {
		o.KeepAlive = defaultKeepAlive
	}
	if o.PacketTimeout <= 0 {
		o.PacketTimeout = defaultPacketTimeout
	}
	if o.HTTPClient == nil {
		o.HTTPClient = defaultHTTPClient
	}
	target, err := o.URL(ctx)
	if err != nil {
		return nil, awsauth.Redact(err)
	}
	handshakeCtx, cancel := context.WithTimeout(ctx, o.PacketTimeout)
	ws, resp, err := websocket.Dial(handshakeCtx, target, &websocket.DialOptions{
		Subprotocols: []string{"mqtt"},
		HTTPClient:   o.HTTPClient,
	})
	cancel()
	if err != nil && resp != nil && resp.StatusCode != http.StatusSwitchingProtocols {
		return nil, HandshakeError{Status: resp.StatusCode, Err: awsauth.Redact(err)}
	}
	if err != nil {
		// The error may quote the URL (a *url.Error does), and the URL carries credentials.
		return nil, fmt.Errorf("connecting to AWS IoT Core: %w", awsauth.Redact(err))
	}
	s := &socket{
		Conn:    websocket.NetConn(context.Background(), ws, websocket.MessageBinary),
		ws:      ws,
		timeout: o.PacketTimeout,
	}
	// NetConn lifts the read limit; set it after.
	ws.SetReadLimit(ReadLimit)

	c := &Conn{socket: s, onLost: o.OnLost}
	c.client = paho.NewClient(paho.ClientConfig{
		ClientID:      o.ClientID,
		Conn:          s,
		PacketTimeout: o.PacketTimeout,
		OnPublishReceived: []func(paho.PublishReceived) (bool, error){
			func(pr paho.PublishReceived) (bool, error) {
				if o.OnMessage != nil {
					deliver(o.OnMessage, Message{Topic: pr.Packet.Topic, Payload: pr.Packet.Payload})
				}
				return true, nil
			},
		},
		// The loss is reported as its cause alone: whoever reports it says what ended.
		OnClientError: func(err error) {
			c.lost(awsauth.Redact(err))
		},
		OnServerDisconnect: func(d *paho.Disconnect) {
			c.lost(ReasonError{Packet: "DISCONNECT", Code: d.ReasonCode})
		},
	})

	ack, err := c.client.Connect(ctx, &paho.Connect{ClientID: o.ClientID, KeepAlive: o.KeepAlive, CleanStart: true})
	if err != nil {
		// Connect closed the socket.
		_ = ws.CloseNow()
		if ack != nil && ack.ReasonCode >= 0x80 {
			return nil, ReasonError{Packet: "CONNECT", Code: ack.ReasonCode}
		}
		return nil, fmt.Errorf("connecting to AWS IoT Core: %w", awsauth.Redact(err))
	}
	if len(o.Subscriptions) > 0 {
		subs := make([]paho.SubscribeOptions, 0, len(o.Subscriptions))
		for _, topic := range o.Subscriptions {
			subs = append(subs, paho.SubscribeOptions{Topic: topic, QoS: 1})
		}
		suback, err := c.client.Subscribe(ctx, &paho.Subscribe{Subscriptions: subs})
		if err != nil || suback == nil {
			_ = c.Close()
			if suback != nil {
				for _, code := range suback.Reasons {
					if code >= 0x80 {
						return nil, ReasonError{Packet: "SUBSCRIBE", Code: code}
					}
				}
			}
			if err == nil {
				err = errors.New("no SUBACK")
			}
			return nil, fmt.Errorf("subscribing on AWS IoT Core: %w", awsauth.Redact(err))
		}
	}
	// A connection lost while Dial still ran is Dial's error, not a loss to report.
	c.mu.Lock()
	ended := c.ended
	c.ready = ended == nil
	c.mu.Unlock()
	if ended != nil {
		_ = c.Close()
		return nil, fmt.Errorf("connecting to AWS IoT Core: %w", ended)
	}
	return c, nil
}

// deliver calls OnMessage; a panic in it drops that message instead of ending the process.
func deliver(onMessage func(Message), m Message) {
	defer func() { _ = recover() }()
	onMessage(m)
}

// lost reports the end of the connection once, unless Close came first or Dial has not returned
// the connection yet. OnLost runs outside the lock so that it may call Close.
func (c *Conn) lost(err error) {
	c.mu.Lock()
	if c.closed || c.ended != nil {
		c.mu.Unlock()
		return
	}
	c.ended = err
	report := c.ready && c.onLost != nil
	c.mu.Unlock()
	if report {
		defer func() { _ = recover() }()
		c.onLost(err)
	}
}

// Publish sends one QoS 1 message, never retained, and waits for its PUBACK within the packet
// timeout. expirySeconds > 0 asks the broker to drop the message when it could not be delivered
// in time. A PUBACK reason code at or above 0x80 is a ReasonError.
func (c *Conn) Publish(ctx context.Context, topic string, payload []byte, expirySeconds uint32) error {
	p := &paho.Publish{Topic: topic, QoS: 1, Payload: payload}
	if expirySeconds > 0 {
		p.Properties = &paho.PublishProperties{MessageExpiry: &expirySeconds}
	}
	// paho forgets an unacknowledged publish when the connection ends without telling the caller,
	// who would wait out the timeout: stop waiting when the connection ends.
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	go func() {
		select {
		case <-c.client.Done():
			cancel(errEnded)
		case <-ctx.Done():
		}
	}()
	resp, err := c.client.Publish(ctx, p)
	if resp != nil && resp.ReasonCode >= 0x80 {
		return ReasonError{Packet: "PUBLISH", Code: resp.ReasonCode}
	}
	if err != nil {
		if errors.Is(context.Cause(ctx), errEnded) {
			err = errEnded
		}
		return fmt.Errorf("publishing to AWS IoT Core: %w", awsauth.Redact(err))
	}
	return nil
}

var errEnded = errors.New("the connection to AWS IoT Core has ended")

// Done is closed once the connection has ended.
func (c *Conn) Done() <-chan struct{} { return c.client.Done() }

// Close sends a DISCONNECT and closes the connection; it never reports a loss, returns once the
// client's goroutines have ended, and is safe to call more than once and from OnLost.
func (c *Conn) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		<-c.client.Done()
		return nil
	}
	c.closed = true
	c.mu.Unlock()
	if !c.socket.TryLock() {
		// A write is under way, perhaps stuck on a dead socket: do not wait behind it for the
		// DISCONNECT, close the socket now.
		_ = c.socket.ws.CloseNow()
	} else {
		c.socket.Unlock()
	}
	// Disconnect sends the DISCONNECT and waits for the client to shut down.
	_ = c.client.Disconnect(&paho.Disconnect{ReasonCode: 0})
	return nil
}

// socket is the WebSocket as the net.Conn paho writes MQTT packets to. Its lock is the one paho
// takes around each packet's writes (several goroutines write); each write must complete within
// the packet timeout, or the WebSocket closes and the connection is lost; Close ends the socket
// at once, without the WebSocket close handshake (which waits up to 10 s on a dead socket).
type socket struct {
	net.Conn
	sync.Mutex
	ws      *websocket.Conn
	timeout time.Duration
}

func (s *socket) Write(p []byte) (int, error) {
	_ = s.Conn.SetWriteDeadline(time.Now().Add(s.timeout))
	n, err := s.Conn.Write(p)
	_ = s.Conn.SetWriteDeadline(time.Time{})
	return n, err
}

func (s *socket) Close() error {
	err := s.ws.CloseNow()
	// Releases the adapter's timers; the WebSocket is already closed, so this returns at once.
	_ = s.Conn.Close()
	return err
}
