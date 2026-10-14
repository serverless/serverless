package bridge

// reorderBuffer puts a stream's data frames back in order (AWS IoT Core QoS 1 neither orders nor
// deduplicates) and knows when the stream is complete.
type reorderBuffer struct {
	next      int
	held      map[int][]byte
	count     int
	ended     bool
	errorType string
	errorBody string
}

const maxHeldFrames = 64

func (b *reorderBuffer) add(n int, data []byte) bool {
	if b.held == nil {
		b.held = map[int][]byte{}
	}
	if n < b.next {
		return true // a copy of a frame already written
	}
	if _, dup := b.held[n]; dup {
		return true
	}
	if len(b.held) >= maxHeldFrames {
		return false
	}
	b.held[n] = data
	return true
}

func (b *reorderBuffer) end(count int, errorType, errorBody string) {
	b.ended, b.count, b.errorType, b.errorBody = true, count, errorType, errorBody
}

func (b *reorderBuffer) ready() [][]byte {
	var out [][]byte
	for {
		data, ok := b.held[b.next]
		if !ok {
			return out
		}
		delete(b.held, b.next)
		b.next++
		out = append(out, data)
	}
}

func (b *reorderBuffer) complete() (bool, string, string) {
	return b.ended && b.next >= b.count, b.errorType, b.errorBody
}
