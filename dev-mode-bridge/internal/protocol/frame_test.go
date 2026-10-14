package protocol

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

type vectorFile struct {
	KeyBase64 string `json:"keyBase64"`
	Vectors   []struct {
		Name            string `json:"name"`
		NonceHex        string `json:"nonceHex"`
		Seq             uint32 `json:"seq"`
		Topic           string `json:"topic"`
		PlaintextBase64 string `json:"plaintextBase64"`
		MessageHex      string `json:"messageHex"`
	} `json:"vectors"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectorFile
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Vectors) == 0 {
		t.Fatal("no vectors")
	}
	return v
}

func TestTheConstantsAreTheOnesTheCLIUses(t *testing.T) {
	if Version != 1 || MaxMessageBytes != 129024 || StreamChunkBytes != 102400 || Overhead != 33 {
		t.Fatalf("version %d, max %d, chunk %d, overhead %d", Version, MaxMessageBytes, StreamChunkBytes, Overhead)
	}
	kinds := []string{KindInvoke, KindUploadURLRequest, KindAccepted, KindResponse, KindError, KindInitError,
		KindStreamStart, KindStreamData, KindStreamEnd, KindExpired, KindNotInDev, KindNeedEnvironment,
		KindUploadURL, KindGone, KindPayload, KindPassed}
	want := "invoke upload_url_request accepted response error init_error stream_start stream_data stream_end " +
		"expired not_in_dev need_environment upload_url gone payload passed"
	if got := strings.Join(kinds, " "); got != want {
		t.Fatalf("kinds %q", got)
	}
}

func TestSealMatchesTheSharedVectors(t *testing.T) {
	v := loadVectors(t)
	key, err := DecodeKey(v.KeyBase64)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Vectors {
		nonce, _ := hex.DecodeString(c.NonceHex)
		plaintext, _ := base64.StdEncoding.DecodeString(c.PlaintextBase64)
		got, err := SealRaw(key, nonce, c.Seq, c.Topic, plaintext)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		if hex.EncodeToString(got) != c.MessageHex {
			t.Errorf("%s: sealed %x, want %s", c.Name, got, c.MessageHex)
		}
	}
}

func TestOpenReadsTheSharedVectors(t *testing.T) {
	v := loadVectors(t)
	key, _ := DecodeKey(v.KeyBase64)
	for _, c := range v.Vectors {
		message, _ := hex.DecodeString(c.MessageHex)
		seq, nonce, plaintext, err := OpenRaw(key, c.Topic, message)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		want, _ := base64.StdEncoding.DecodeString(c.PlaintextBase64)
		if seq != c.Seq || hex.EncodeToString(nonce) != c.NonceHex || !bytes.Equal(plaintext, want) {
			t.Errorf("%s: opened seq %d nonce %x %q", c.Name, seq, nonce, plaintext)
		}
		if _, _, err := DecodeFrame(plaintext); err != nil {
			t.Errorf("%s: header does not decode: %v", c.Name, err)
		}
	}
}

func TestOpenRefusesAnotherTopicAChangedByteAnotherVersionAndAShortMessage(t *testing.T) {
	v := loadVectors(t)
	key, _ := DecodeKey(v.KeyBase64)
	c := v.Vectors[0]
	message, _ := hex.DecodeString(c.MessageHex)
	if _, _, _, err := OpenRaw(key, c.Topic+"x", message); err == nil {
		t.Error("opened under another topic")
	}
	for _, at := range []int{len(message) - 20, len(message) - 1, 10} {
		changed := append([]byte{}, message...)
		changed[at] ^= 1
		if _, _, _, err := OpenRaw(key, c.Topic, changed); err == nil {
			t.Errorf("opened with byte %d changed", at)
		}
	}
	reseq := append([]byte{}, message...)
	reseq[4] ^= 1
	if _, _, _, err := OpenRaw(key, c.Topic, reseq); err == nil {
		t.Error("opened with a changed sequence number")
	}
	other := append([]byte{}, message...)
	other[0] = 2
	if _, _, _, err := OpenRaw(key, c.Topic, other); err == nil {
		t.Error("opened protocol version 2")
	}
	if _, _, _, err := OpenRaw(key, c.Topic, message[:Overhead-1]); err == nil {
		t.Error("opened a short message")
	}
	wrong := make([]byte, 32)
	if _, _, _, err := OpenRaw(wrong, c.Topic, message); err == nil {
		t.Error("opened with another key")
	}
}

func TestOpeningNeverPanicsWhateverArrives(t *testing.T) {
	v := loadVectors(t)
	key, _ := DecodeKey(v.KeyBase64)
	o := NewOpener(key)
	for _, junk := range [][]byte{nil, {}, bytes.Repeat([]byte{1}, Overhead), bytes.Repeat([]byte{0}, 200)} {
		if _, _, _, err := OpenRaw(key, "t", junk); err == nil {
			t.Errorf("opened %x", junk)
		}
		if _, ok := o.Open("t", junk); ok {
			t.Errorf("opener opened %x", junk)
		}
	}
	// A frame that opens but whose plaintext is not a header line and a body is no frame.
	sealed, err := SealRaw(key, bytes.Repeat([]byte{9}, 12), 1, "t", []byte("not json\n"))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := o.Open("t", sealed); ok {
		t.Error("opened a frame without a header")
	}
}

func TestOnlyAThirtyTwoByteKeyAndATwelveByteNonceSeal(t *testing.T) {
	v := loadVectors(t)
	c := v.Vectors[0]
	message, _ := hex.DecodeString(c.MessageHex)
	key, _ := DecodeKey(v.KeyBase64)
	for _, size := range []int{0, 16, 24, 31, 33} {
		short := make([]byte, size)
		if _, err := SealRaw(short, make([]byte, 12), 1, "t", nil); err == nil {
			t.Errorf("sealed with a %d-byte key", size)
		}
		if _, _, _, err := OpenRaw(short, c.Topic, message); err == nil {
			t.Errorf("opened with a %d-byte key", size)
		}
	}
	for _, size := range []int{0, 11, 13} {
		if _, err := SealRaw(key, make([]byte, size), 1, "t", nil); err == nil {
			t.Errorf("sealed with a %d-byte nonce", size)
		}
	}
}

func TestSealerCountsPerTopicAndOpenerDropsCopies(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	s := NewSealer(key)
	o := NewOpener(key)
	first, _ := s.Seal("a", Header{Kind: KindAccepted, ID: "r1"}, nil)
	second, _ := s.Seal("a", Header{Kind: KindAccepted, ID: "r2"}, nil)
	other, _ := s.Seal("b", Header{Kind: KindAccepted, ID: "r3"}, nil)
	if bytes.Equal(first[5:17], second[5:17]) {
		t.Error("two frames share a nonce")
	}
	f1, ok := o.Open("a", first)
	if !ok || f1.Seq != 1 || f1.Header.ID != "r1" {
		t.Fatalf("first: %+v %v", f1, ok)
	}
	if f2, _ := o.Open("a", second); f2.Seq != 2 {
		t.Errorf("second seq %d", f2.Seq)
	}
	if f3, _ := o.Open("b", other); f3.Seq != 1 {
		t.Errorf("other topic seq %d", f3.Seq)
	}
	if _, ok := o.Open("a", first); ok {
		t.Error("a copy was opened twice")
	}
}

func TestOpenerRemembersABoundedNumberOfNonces(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	s := NewSealer(key)
	o := NewOpener(key)
	o.remember = 2
	var sealed [][]byte
	for _, id := range []string{"r1", "r2", "r3"} {
		m, _ := s.Seal("t", Header{Kind: KindAccepted, ID: id}, nil)
		sealed = append(sealed, m)
		if _, ok := o.Open("t", m); !ok {
			t.Fatalf("%s did not open", id)
		}
	}
	if len(o.seen) != 2 || len(o.order) != 2 {
		t.Fatalf("remembers %d nonces in %d slots", len(o.seen), len(o.order))
	}
	if _, ok := o.Open("t", sealed[2]); ok {
		t.Error("the last copy was opened twice")
	}
	if _, ok := o.Open("t", sealed[1]); ok {
		t.Error("the second copy was opened twice")
	}
	if f, ok := o.Open("t", sealed[0]); !ok || f.Header.ID != "r1" {
		t.Errorf("the forgotten nonce did not open again: %+v %v", f, ok)
	}
}

func TestFitsOneMessageAtTheLimit(t *testing.T) {
	h := Header{Kind: KindResponse, ID: "r"}
	head, _ := json.Marshal(h)
	room := MaxMessageBytes - Overhead - len(head) - 1
	if !FitsOneMessage(h, make([]byte, room)) {
		t.Error("a frame of exactly the limit does not fit")
	}
	if FitsOneMessage(h, make([]byte, room+1)) {
		t.Error("a frame one byte over the limit fits")
	}
	plaintext, _ := EncodeFrame(h, make([]byte, room))
	sealed, err := SealRaw(bytes.Repeat([]byte{7}, 32), make([]byte, 12), 1, "t", plaintext)
	if err != nil || len(sealed) != MaxMessageBytes {
		t.Errorf("sealed %d bytes (%v), want %d", len(sealed), err, MaxMessageBytes)
	}
}

func TestDecodeFrameKeepsTheBodyAndRefusesAFrameWithoutAHeader(t *testing.T) {
	body := []byte{10, 0, 10, 255}
	plaintext, _ := EncodeFrame(Header{Kind: KindStreamData}, body)
	if _, got, err := DecodeFrame(plaintext); err != nil || !bytes.Equal(got, body) {
		t.Errorf("body %x %v", got, err)
	}
	for _, p := range []string{"no newline", "{\"no\":\"kind\"}\n", "null\n", "[\"kind\"]\n", "{\"kind\":1}\n"} {
		if _, _, err := DecodeFrame([]byte(p)); err == nil {
			t.Errorf("decoded %q", p)
		}
	}
}

func TestDecodeKeyRefusesOtherLengths(t *testing.T) {
	v := loadVectors(t)
	for _, b64 := range []string{
		"", "AAAA", base64.StdEncoding.EncodeToString(make([]byte, 31)),
		base64.StdEncoding.EncodeToString(make([]byte, 33)), "not base64!",
		"!" + v.KeyBase64, " " + v.KeyBase64, v.KeyBase64 + "\n",
		base64.URLEncoding.EncodeToString(bytes.Repeat([]byte{0xff}, 32)),
		base64.RawStdEncoding.EncodeToString(make([]byte, 32)),
	} {
		if _, err := DecodeKey(b64); err == nil {
			t.Errorf("accepted %q", b64)
		}
	}
	if key, err := DecodeKey(v.KeyBase64); err != nil || len(key) != 32 {
		t.Errorf("refused the shared key: %v", err)
	}
}

func TestTopicsAndClientIDs(t *testing.T) {
	got := []string{UpTopic("s_0123456789ab"), DownTopic("s_0123456789ab", "e0123456789ab"),
		GoneTopic("s_0123456789ab"), PingTopic("s_0123456789ab"), LaptopClientID("s_0123456789ab"),
		BridgeClientID("s_0123456789ab", "e0123456789ab")}
	want := []string{"sls-dev/s_0123456789ab/up", "sls-dev/s_0123456789ab/down/e0123456789ab",
		"sls-dev/s_0123456789ab/gone", "sls-dev/s_0123456789ab/ping", "sls-dev-s_0123456789ab-cli",
		"sls-dev-s_0123456789ab-e0123456789ab"}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got %q, want %q", got[i], want[i])
		}
	}
}

// Field names agree across languages: a frame the CLI sealed opens here with every field, and a
// frame sealed here matches the CLI's tests (relay/protocol.test.js holds the same two constants).
const (
	sealedByTheCLI    = "0100000003ffeeddccbbaa998877665544a56463622391c2f92b1f193f54fdcf7eae81e144144164638c1be7c646bcbb5bb100e1719f733f66fd44af967742656c2f44b3cebe7ad3c6cf"
	sealedByTheBridge = "0100000009000102030405060708090a0b3c20bd72ab81e021af33f2f8c186161ee6f4ab16991f7d461a15c7a93f0a6fdc7575c088fbb862fd569e5d99edff5c179e3501e434f48ff84ca4082363c19e8b891efc58b8f30a437b31de4cd5ad69ca14a8ad071a06270ddfc7bca85a8d95afbe883589c525ea20e53e4bc024571b5dcf454e8988a05cb877dd3cffa0ca4c7acf3e4db596edf26338d1789140a746ab7105da714cdc973171df91705aeb2f"
)

func TestHeadersCrossBetweenTheCLIAndTheBridge(t *testing.T) {
	v := loadVectors(t)
	key, _ := DecodeKey(v.KeyBase64)
	msg, _ := hex.DecodeString(sealedByTheCLI)
	f, ok := NewOpener(key).Open("t", msg)
	if !ok || f.Header.Kind != KindStreamEnd || f.Header.ID != "r" || f.Header.Count != 0 || f.Seq != 3 {
		t.Fatalf("%+v %v", f, ok)
	}
	nonce, _ := hex.DecodeString("000102030405060708090a0b")
	plaintext, _ := EncodeFrame(Header{Kind: KindResponse, ID: "r", ContentType: "text/plain", S3: &S3Object{Key: "k", Get: "g", Delete: "d"}, Upload: &Upload{URL: "u", Key: "k2", TTLMs: 900000}}, nil)
	sealed, _ := SealRaw(key, nonce, 9, "t", plaintext)
	if hex.EncodeToString(sealed) != sealedByTheBridge {
		t.Fatalf("sealed %x", sealed)
	}
}
