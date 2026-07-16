'use strict'

// A short, readable tag for a MicroVM id (`microvm-75e525bb-…-6149ba` → `75e525bb`) — used to
// prefix that VM's streamed logs without repeating the full 45-char id on every line. The full id
// is printed once at launch (and returned by the API) for copy-paste into `aws lambda-microvms`.
export function shortMicrovmId(id) {
  return String(id || '')
    .replace(/^microvm-/, '')
    .slice(0, 8)
}

// Demux a Docker multiplexed log stream into clean, complete text lines.
//
// `container.logs({follow,stdout,stderr})` on a non-TTY container (which is how the emulator runs
// the worker) returns a MULTIPLEXED stream: repeating frames of
//   [streamType(1)][0,0,0][payloadSize(4, big-endian)][payload(payloadSize bytes)]
// Writing those bytes straight to the terminal leaks the 8-byte headers as garbage. This returns a
// function you feed raw chunks; it invokes onLine(line, stream) for each finished line — stream is
// 'stdout' or 'stderr', recovered from the frame's type byte so callers can render stderr distinctly
// (like functions Dev Mode reds it). It buffers across chunks because both frames and lines can span
// chunk boundaries. The returned feed has a .flush() to emit a trailing partial line (e.g. a
// container that dies mid-line) on stop.
export function createDockerLogDemuxer(onLine) {
  let buf = Buffer.alloc(0)
  // Docker multiplexes stdout and stderr independently, so a partial (newline-less)
  // line on one stream must not absorb bytes from the other. Buffer per stream.
  const partial = { stdout: '', stderr: '' }

  const flush = (text, stream) => {
    let pending = partial[stream] + text
    let i
    while ((i = pending.indexOf('\n')) >= 0) {
      onLine(pending.slice(0, i).replace(/\r$/, ''), stream)
      pending = pending.slice(i + 1)
    }
    partial[stream] = pending
  }

  const feed = (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    while (buf.length >= 8) {
      // Header byte 0 is the stream: 1 = stdout, 2 = stderr. We keep it (not just the size at bytes
      // 4-7) so the caller can tell a worker's errors from its normal output.
      const stream = buf[0] === 2 ? 'stderr' : 'stdout'
      const size = buf.readUInt32BE(4)
      if (buf.length < 8 + size) break // wait for the rest of this frame's payload
      flush(buf.subarray(8, 8 + size).toString('utf8'), stream)
      buf = buf.subarray(8 + size)
    }
  }
  feed.flush = () => {
    for (const stream of ['stdout', 'stderr']) {
      if (partial[stream].length) {
        onLine(partial[stream], stream)
        partial[stream] = ''
      }
    }
  }
  return feed
}
