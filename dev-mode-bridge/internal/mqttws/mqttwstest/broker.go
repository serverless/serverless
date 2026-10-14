// Package mqttwstest is an in-process MQTT 5 broker over WebSocket for the bridge's tests: just
// enough of AWS IoT Core's behaviour (QoS 1, exact topics and a trailing "#", reason codes,
// duplicate delivery, dropped connections) to test the client and the relay without AWS. It
// speaks MQTT 5 with eclipse/paho.golang's packet codec over coder/websocket, so a client under
// test meets real packets.
//
// What it copies from AWS IoT Core: the /mqtt path and the "mqtt" WebSocket subprotocol; the
// CONNACK's maximum packet size (149,504 bytes) and receive maximum (100); a client that sends a
// larger packet is disconnected with reason 0x95; a second connection with a client id takes it
// over and the first is disconnected with reason 0x8E; a client that publishes receives its own
// message when subscribed to its topic; QoS 2 is granted as QoS 1.
package mqttwstest

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"

	"github.com/coder/websocket"
	"github.com/eclipse/paho.golang/packets"
)

const (
	// MaximumPacketSize is the largest MQTT packet AWS IoT Core accepts and sends, in bytes.
	MaximumPacketSize = 149504
	// ReceiveMaximum is how many QoS 1 publishes AWS IoT Core lets a client have unacknowledged.
	ReceiveMaximum = 100

	reasonProtocolError     = 0x82
	reasonUnsupportedVer    = 0x84
	reasonSessionTakenOver  = 0x8E
	reasonPacketTooLarge    = 0x95
	readLimit               = 1 << 20
	grantedQoSForAnyRequest = 1
)

// Published is one PUBLISH the broker received and accepted.
type Published struct {
	ClientID string
	Topic    string
	Payload  []byte
	QoS      byte
	Retain   bool
	Expiry   *uint32
}

// Broker is the fake. Change its behaviour with Set; tests may set the fields before clients
// connect.
type Broker struct {
	Server *httptest.Server

	mu sync.Mutex
	// ConnackCode, and SubackCode and PubackCode per topic, when 0x80 or above, are answered
	// instead of success. A refused CONNECT is followed by closing the connection.
	ConnackCode byte
	// HandshakeStatus, when set, answers the WebSocket upgrade with this HTTP status instead
	// (AWS IoT Core answers 403 to a connection it does not authorize).
	HandshakeStatus int
	SubackCode      map[string]byte
	PubackCode      map[string]byte
	// Duplicate delivers every routed message twice (QoS 1 is at least once).
	Duplicate bool
	// Hold stops routing while true: publishes are acknowledged and recorded, but never delivered.
	Hold bool
	// Silent stops reading, acknowledging and routing while true, like a half-open socket after a
	// long freeze: nothing a client sends is read, so its PINGREQ goes unanswered and its writes
	// pile up in the socket buffers.
	Silent    bool
	clients   map[string]*client
	open      map[*client]struct{}
	published []Published
	connects  []string
	changed   chan struct{}
	closed    bool
}

type client struct {
	id        string
	connected bool // a CONNECT was accepted
	ws        *websocket.Conn
	conn      net.Conn
	write     sync.Mutex
	nextID    uint16
	subs      map[string]byte // topic filter -> granted QoS
	done      chan struct{}
	once      sync.Once
}

// New starts a broker; its WebSocket URL is URL().
func New() *Broker {
	b := &Broker{
		SubackCode: map[string]byte{},
		PubackCode: map[string]byte{},
		clients:    map[string]*client{},
		open:       map[*client]struct{}{},
		changed:    make(chan struct{}),
	}
	b.Server = httptest.NewServer(http.HandlerFunc(b.serve))
	return b
}

// URL is the ws:// address of the broker's /mqtt endpoint.
func (b *Broker) URL() string { return "ws" + strings.TrimPrefix(b.Server.URL, "http") + "/mqtt" }

// Close ends every connection, without a DISCONNECT, and stops the broker.
func (b *Broker) Close() {
	b.mu.Lock()
	b.closed = true
	open := make([]*client, 0, len(b.open))
	for c := range b.open {
		open = append(open, c)
	}
	b.mu.Unlock()
	for _, c := range open {
		c.close()
	}
	b.Server.Close()
}

// Matches says whether an MQTT topic filter matches a topic name: "+" matches one level, a
// trailing "#" matches the parent level and everything below it, and a wildcard in the first
// level never matches a topic that starts with "$".
func Matches(filter, topic string) bool {
	if strings.HasPrefix(topic, "$") && (strings.HasPrefix(filter, "+") || strings.HasPrefix(filter, "#")) {
		return false
	}
	f := strings.Split(filter, "/")
	t := strings.Split(topic, "/")
	for i, level := range f {
		if level == "#" {
			return i == len(f)-1
		}
		if i >= len(t) {
			return false
		}
		if level != "+" && level != t[i] {
			return false
		}
	}
	return len(f) == len(t)
}

func (b *Broker) serve(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/mqtt" {
		http.NotFound(w, r)
		return
	}
	b.mu.Lock()
	status := b.HandshakeStatus
	b.mu.Unlock()
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"mqtt"}})
	if err != nil {
		return
	}
	if ws.Subprotocol() != "mqtt" {
		_ = ws.Close(websocket.StatusPolicyViolation, "the mqtt subprotocol is required")
		return
	}
	c := &client{ws: ws, subs: map[string]byte{}, done: make(chan struct{})}
	// NetConn lifts the read limit; set it after.
	c.conn = websocket.NetConn(context.Background(), ws, websocket.MessageBinary)
	ws.SetReadLimit(readLimit)
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		c.close()
		return
	}
	b.open[c] = struct{}{}
	b.mu.Unlock()
	defer func() {
		b.mu.Lock()
		delete(b.open, c)
		if c.connected && b.clients[c.id] == c {
			delete(b.clients, c.id)
		}
		b.mu.Unlock()
		c.close()
	}()

	counter := &countingReader{r: c.conn}
	for {
		if !b.waitWhileSilent(c) {
			return
		}
		counter.n = 0
		cp, err := packets.ReadPacket(counter)
		if err != nil {
			return
		}
		if b.isSilent() {
			// A half-open socket: what arrived is never read by anyone.
			continue
		}
		if counter.n > MaximumPacketSize {
			c.disconnect(reasonPacketTooLarge)
			return
		}
		if _, isConnect := cp.Content.(*packets.Connect); isConnect == c.connected {
			// The first packet must be a CONNECT, and only the first.
			c.disconnect(reasonProtocolError)
			return
		}
		switch p := cp.Content.(type) {
		case *packets.Connect:
			if !b.connect(c, p) {
				return
			}
		case *packets.Subscribe:
			b.subscribe(c, p)
		case *packets.Publish:
			b.publish(c, p)
		case *packets.Pingreq:
			c.send(packets.NewControlPacket(packets.PINGRESP))
		case *packets.Disconnect:
			return
		case *packets.Puback:
			// The client acknowledged a delivery.
		}
	}
}

func (b *Broker) connect(c *client, p *packets.Connect) bool {
	ack := packets.NewControlPacket(packets.CONNACK)
	connack := ack.Content.(*packets.Connack)
	if p.ProtocolVersion != 5 {
		connack.ReasonCode = reasonUnsupportedVer
		c.send(ack)
		return false
	}
	b.mu.Lock()
	code := b.ConnackCode
	b.connects = append(b.connects, p.ClientID)
	var old *client
	if code < 0x80 {
		c.id, c.connected = p.ClientID, true
		old = b.clients[c.id]
		b.clients[c.id] = c
	}
	b.mu.Unlock()
	if old != nil {
		old.disconnect(reasonSessionTakenOver)
	}
	connack.ReasonCode = code
	maxPacket := uint32(MaximumPacketSize)
	receiveMax := uint16(ReceiveMaximum)
	connack.Properties.MaximumPacketSize = &maxPacket
	connack.Properties.ReceiveMaximum = &receiveMax
	c.send(ack)
	return code < 0x80
}

func (b *Broker) subscribe(c *client, p *packets.Subscribe) {
	ack := packets.NewControlPacket(packets.SUBACK)
	suback := ack.Content.(*packets.Suback)
	suback.PacketID = p.PacketID
	b.mu.Lock()
	for _, s := range p.Subscriptions {
		code := b.SubackCode[s.Topic]
		if code < 0x80 {
			code = min(s.QoS, grantedQoSForAnyRequest)
			c.subs[s.Topic] = code
		}
		suback.Reasons = append(suback.Reasons, code)
	}
	b.mu.Unlock()
	c.send(ack)
}

func (b *Broker) publish(c *client, p *packets.Publish) {
	var expiry *uint32
	if p.Properties != nil && p.Properties.MessageExpiry != nil {
		e := *p.Properties.MessageExpiry
		expiry = &e
	}
	b.mu.Lock()
	code := b.PubackCode[p.Topic]
	if code < 0x80 {
		b.published = append(b.published, Published{
			ClientID: c.id, Topic: p.Topic, Payload: append([]byte{}, p.Payload...),
			QoS: p.QoS, Retain: p.Retain, Expiry: expiry,
		})
	}
	b.mu.Unlock()
	if p.QoS > 0 {
		ack := packets.NewControlPacket(packets.PUBACK)
		puback := ack.Content.(*packets.Puback)
		puback.PacketID = p.PacketID
		puback.ReasonCode = code
		c.send(ack)
	}
	if code < 0x80 {
		b.route(p.Topic, p.Payload, expiry)
	}
}

// route delivers to every client subscribed to topic, unless Hold or Silent is set.
func (b *Broker) route(topic string, payload []byte, expiry *uint32) {
	b.mu.Lock()
	if b.Hold || b.Silent {
		b.mu.Unlock()
		return
	}
	times := 1
	if b.Duplicate {
		times = 2
	}
	type target struct {
		c   *client
		qos byte
	}
	var targets []target
	for _, c := range b.clients {
		granted, found := byte(0), false
		for filter, qos := range c.subs {
			if Matches(filter, topic) {
				granted, found = max(granted, qos), true
			}
		}
		if found {
			targets = append(targets, target{c, granted})
		}
	}
	b.mu.Unlock()
	for _, t := range targets {
		for range times {
			t.c.deliver(topic, payload, t.qos, expiry)
		}
	}
}

func (c *client) deliver(topic string, payload []byte, qos byte, expiry *uint32) {
	cp := packets.NewControlPacket(packets.PUBLISH)
	p := cp.Content.(*packets.Publish)
	p.Topic = topic
	p.QoS = qos
	p.Payload = payload
	p.Properties.MessageExpiry = expiry
	c.write.Lock()
	defer c.write.Unlock()
	if qos > 0 {
		c.nextID++
		if c.nextID == 0 {
			c.nextID = 1
		}
		p.PacketID = c.nextID
	}
	c.writeLocked(cp)
}

func (c *client) send(cp *packets.ControlPacket) {
	c.write.Lock()
	defer c.write.Unlock()
	c.writeLocked(cp)
}

// writeLocked sends one packet as one WebSocket message.
func (c *client) writeLocked(cp *packets.ControlPacket) {
	var buf bytes.Buffer
	if _, err := cp.WriteTo(&buf); err != nil {
		return
	}
	_, _ = c.conn.Write(buf.Bytes())
}

// disconnect sends a DISCONNECT with the reason code, then closes the connection.
func (c *client) disconnect(reason byte) {
	cp := packets.NewControlPacket(packets.DISCONNECT)
	cp.Content.(*packets.Disconnect).ReasonCode = reason
	c.send(cp)
	c.close()
}

// close ends the connection at once, without a WebSocket close handshake.
func (c *client) close() {
	c.once.Do(func() {
		close(c.done)
		_ = c.ws.CloseNow()
	})
}

type countingReader struct {
	r io.Reader
	n int
}

func (r *countingReader) Read(p []byte) (int, error) {
	n, err := r.r.Read(p)
	r.n += n
	return n, err
}

func (b *Broker) isSilent() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Silent
}

// waitWhileSilent blocks while the broker is Silent; false means the connection was closed.
func (b *Broker) waitWhileSilent(c *client) bool {
	b.mu.Lock()
	for b.Silent {
		changed := b.changed
		b.mu.Unlock()
		select {
		case <-changed:
		case <-c.done:
			return false
		}
		b.mu.Lock()
	}
	b.mu.Unlock()
	return true
}

// Send delivers to every client subscribed to topic, as if another client had published it
// (Hold, Silent and Duplicate apply).
func (b *Broker) Send(topic string, payload []byte) {
	b.route(topic, payload, nil)
}

// Drop ends the client's connection without a DISCONNECT, like a network failure.
func (b *Broker) Drop(clientID string) {
	b.mu.Lock()
	c := b.clients[clientID]
	delete(b.clients, clientID)
	b.mu.Unlock()
	if c != nil {
		c.close()
	}
}

// Published returns what the broker received and accepted so far.
func (b *Broker) Published() []Published {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]Published{}, b.published...)
}

// Connects returns the client ids of every CONNECT so far, refused ones included.
func (b *Broker) Connects() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]string{}, b.connects...)
}

// Connected says whether a client with this id is connected now.
func (b *Broker) Connected(clientID string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.clients[clientID] != nil
}

// Set changes the broker's behaviour under its lock; f must not call the broker's methods.
func (b *Broker) Set(f func(b *Broker)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	f(b)
	close(b.changed)
	b.changed = make(chan struct{})
}
