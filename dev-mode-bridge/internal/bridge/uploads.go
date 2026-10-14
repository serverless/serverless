package bridge

import (
	"sync"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// uploadPool keeps spare presigned PUT URLs the developer's machine sent with its replies. Each is
// used once.
type uploadPool struct {
	now   func() time.Time
	mu    sync.Mutex
	spare []spareUpload
}

type spareUpload struct {
	upload  protocol.Upload
	expires time.Time
}

func (p *uploadPool) put(u protocol.Upload) {
	p.mu.Lock()
	defer p.mu.Unlock()
	// A minute of margin: the upload must start before the URL expires.
	p.spare = append(p.spare, spareUpload{upload: u, expires: p.now().Add(time.Duration(u.TTLMs)*time.Millisecond - time.Minute)})
	if len(p.spare) > 4 {
		p.spare = p.spare[len(p.spare)-4:]
	}
}

func (p *uploadPool) take() (protocol.Upload, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for len(p.spare) > 0 {
		u := p.spare[len(p.spare)-1]
		p.spare = p.spare[:len(p.spare)-1]
		if p.now().Before(u.expires) {
			return u.upload, true
		}
	}
	return protocol.Upload{}, false
}
