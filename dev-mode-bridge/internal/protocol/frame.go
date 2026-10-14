// Package protocol is the Dev Mode relay's wire format, shared with the CLI
// (packages/serverless/lib/plugins/aws/dev/relay/protocol.js). Every MQTT message and every S3
// payload object is one sealed frame:
//
//	byte 0      protocol version (1)
//	bytes 1-4   sequence number of the sender on this topic (uint32, big-endian)
//	bytes 5-16  nonce (12 random bytes)
//	bytes 17-   AES-256-GCM ciphertext of the frame, then the 16-byte tag
//
// The additional authenticated data is bytes 0-4 followed by the topic, so a frame cannot be moved
// to another topic or have its sequence number changed. The plaintext is a JSON header, a newline
// and the body bytes. Changing any of this is a new protocol version.
package protocol

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
)

// Version is the protocol version this bridge speaks.
const Version = 1

const (
	// MaxMessageBytes is the largest MQTT message Dev Mode publishes.
	MaxMessageBytes = 129024
	// StreamChunkBytes is the most body a stream data frame carries.
	StreamChunkBytes = 100 * 1024
	prefixBytes      = 17
	nonceBytes       = 12
	tagBytes         = 16
	keyBytes         = 32
	// Overhead is what sealing adds to a plaintext.
	Overhead = prefixBytes + tagBytes
)

// Frame kinds.
const (
	KindInvoke           = "invoke"
	KindUploadURLRequest = "upload_url_request"
	KindAccepted         = "accepted"
	KindResponse         = "response"
	KindError            = "error"
	KindInitError        = "init_error"
	KindStreamStart      = "stream_start"
	KindStreamData       = "stream_data"
	KindStreamEnd        = "stream_end"
	KindExpired          = "expired"
	KindNotInDev         = "not_in_dev"
	KindNeedEnvironment  = "need_environment"
	KindUploadURL        = "upload_url"
	KindGone             = "gone"
	// KindPayload is the header of an S3 payload object (its topic is s3/<key>).
	KindPayload = "payload"
	// KindPassed is a bridge's count of the invocations it handed to the deployed code because the
	// session could not be reached; its body is JSON: {"since": <unix ms>, "counts": [{"fn",
	// "reason", "n"}]}.
	KindPassed = "passed"
)

// S3Object names a payload the bridge uploaded (invoke) or one the laptop uploaded (replies).
type S3Object struct {
	Key       string `json:"key,omitempty"`
	VersionID string `json:"versionId,omitempty"`
	Get       string `json:"get,omitempty"`
	Delete    string `json:"delete,omitempty"`
}

// Upload is a presigned PUT the laptop hands the bridge for one request payload above one message.
type Upload struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	Key     string            `json:"key"`
	TTLMs   int64             `json:"ttlMs"`
}

// Header is a frame's JSON header. Kinds use the fields they need; the rest stay empty.
type Header struct {
	Kind        string            `json:"kind"`
	Env         string            `json:"env,omitempty"`
	Fn          string            `json:"fn,omitempty"`
	ID          string            `json:"id,omitempty"`
	SentAt      int64             `json:"sentAt,omitempty"`
	RemainingMs int64             `json:"remainingMs,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Environment map[string]string `json:"environment,omitempty"`
	ContentType string            `json:"contentType,omitempty"`
	ErrorType   string            `json:"errorType,omitempty"`
	ErrorBody   string            `json:"errorBody,omitempty"`
	N           int               `json:"n,omitempty"`
	Count       int               `json:"count,omitempty"`
	S3          *S3Object         `json:"s3,omitempty"`
	Upload      *Upload           `json:"upload,omitempty"`
}

// Frame is an opened message.
type Frame struct {
	Header Header
	Body   []byte
	Seq    uint32
}

var errKey = errors.New("a Dev Mode session key is 32 bytes in base64")

// DecodeKey reads SLS_DEV_SESSION_KEY: the standard base64 of exactly 32 bytes, nothing else (no
// whitespace, no URL alphabet, no missing padding), as the CLI refuses the same.
func DecodeKey(b64 string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(key) != keyBytes || base64.StdEncoding.EncodeToString(key) != b64 {
		return nil, errKey
	}
	return key, nil
}

// aead is AES-256-GCM; any key but 32 bytes is refused, never taken for AES-128 or AES-192.
func aead(key []byte) (cipher.AEAD, error) {
	if len(key) != keyBytes {
		return nil, errKey
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func additionalData(prefix []byte, topic string) []byte {
	return append(append([]byte{}, prefix[:5]...), topic...)
}

// SealRaw seals plaintext with the given nonce (12 bytes) and sequence number.
func SealRaw(key, nonce []byte, seq uint32, topic string, plaintext []byte) ([]byte, error) {
	gcm, err := aead(key)
	if err != nil {
		return nil, err
	}
	if len(nonce) != nonceBytes {
		return nil, errors.New("a nonce is 12 bytes")
	}
	prefix := make([]byte, prefixBytes, prefixBytes+len(plaintext)+tagBytes)
	prefix[0] = Version
	binary.BigEndian.PutUint32(prefix[1:5], seq)
	copy(prefix[5:], nonce)
	return gcm.Seal(prefix, nonce, plaintext, additionalData(prefix, topic)), nil
}

// OpenRaw returns the sequence number, nonce and plaintext of a frame sealed with key for topic.
func OpenRaw(key []byte, topic string, message []byte) (uint32, []byte, []byte, error) {
	if len(message) < Overhead || message[0] != Version {
		return 0, nil, nil, errors.New("not a Dev Mode frame of this protocol version")
	}
	gcm, err := aead(key)
	if err != nil {
		return 0, nil, nil, err
	}
	prefix := message[:prefixBytes]
	plaintext, err := gcm.Open(nil, prefix[5:], message[prefixBytes:], additionalData(prefix, topic))
	if err != nil {
		return 0, nil, nil, err
	}
	return binary.BigEndian.Uint32(prefix[1:5]), append([]byte{}, prefix[5:]...), plaintext, nil
}

// EncodeFrame is the plaintext of a frame.
func EncodeFrame(h Header, body []byte) ([]byte, error) {
	head, err := json.Marshal(h)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 0, len(head)+1+len(body))
	out = append(append(append(out, head...), '\n'), body...)
	return out, nil
}

// DecodeFrame splits a plaintext into its header and body.
func DecodeFrame(plaintext []byte) (Header, []byte, error) {
	end := bytes.IndexByte(plaintext, '\n')
	if end < 0 {
		return Header{}, nil, errors.New("a frame has a header line")
	}
	var h Header
	if err := json.Unmarshal(plaintext[:end], &h); err != nil {
		return Header{}, nil, err
	}
	if h.Kind == "" {
		return Header{}, nil, errors.New("a frame header has a kind")
	}
	return h, plaintext[end+1:], nil
}

// FitsOneMessage says whether a frame with this header and body fits one MQTT message.
func FitsOneMessage(h Header, body []byte) bool {
	head, err := json.Marshal(h)
	return err == nil && len(head)+1+len(body)+Overhead <= MaxMessageBytes
}

// Sealer seals frames for one sender: a fresh nonce each, sequence numbers counting up per topic.
type Sealer struct {
	key  []byte
	mu   sync.Mutex
	seqs map[string]uint32
	rand func([]byte) (int, error)
}

// NewSealer returns a Sealer for the session key.
func NewSealer(key []byte) *Sealer {
	return &Sealer{key: key, seqs: map[string]uint32{}, rand: rand.Read}
}

// Seal seals one frame for topic.
func (s *Sealer) Seal(topic string, h Header, body []byte) ([]byte, error) {
	plaintext, err := EncodeFrame(h, body)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, nonceBytes)
	if _, err := s.rand(nonce); err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.seqs[topic]++
	seq := s.seqs[topic]
	s.mu.Unlock()
	return SealRaw(s.key, nonce, seq, topic, plaintext)
}

// Opener opens frames for one receiver and drops copies: AWS IoT Core delivers a QoS 1 message
// more than once now and then, and a copy carries the same nonce.
type Opener struct {
	key      []byte
	remember int
	mu       sync.Mutex
	seen     map[string]struct{}
	order    []string
}

// NewOpener returns an Opener that remembers the last 4096 nonces.
func NewOpener(key []byte) *Opener {
	return &Opener{key: key, remember: 4096, seen: map[string]struct{}{}}
}

// Open returns the frame, or ok=false for a copy or anything that does not open and decode.
func (o *Opener) Open(topic string, message []byte) (Frame, bool) {
	seq, nonce, plaintext, err := OpenRaw(o.key, topic, message)
	if err != nil {
		return Frame{}, false
	}
	id := hex.EncodeToString(nonce)
	o.mu.Lock()
	if _, dup := o.seen[id]; dup {
		o.mu.Unlock()
		return Frame{}, false
	}
	o.seen[id] = struct{}{}
	o.order = append(o.order, id)
	if len(o.order) > o.remember {
		delete(o.seen, o.order[0])
		o.order = o.order[1:]
	}
	o.mu.Unlock()
	h, body, err := DecodeFrame(plaintext)
	if err != nil {
		return Frame{}, false
	}
	return Frame{Header: h, Body: body, Seq: seq}, true
}

// UpTopic is where the bridges of a session publish to the CLI.
func UpTopic(session string) string { return "sls-dev/" + session + "/up" }

// DownTopic is where the CLI publishes to one execution environment's bridge.
func DownTopic(session, environment string) string {
	return "sls-dev/" + session + "/down/" + environment
}

// GoneTopic carries the CLI's will and goodbye.
func GoneTopic(session string) string { return "sls-dev/" + session + "/gone" }

// PingTopic is the Direct Messaging liveness topic of a session.
func PingTopic(session string) string { return "sls-dev/" + session + "/ping" }

// LaptopClientID is the MQTT client id of the session's CLI.
func LaptopClientID(session string) string { return "sls-dev-" + session + "-cli" }

// BridgeClientID is the MQTT client id of one execution environment's bridge.
func BridgeClientID(session, environment string) string {
	return "sls-dev-" + session + "-" + environment
}
