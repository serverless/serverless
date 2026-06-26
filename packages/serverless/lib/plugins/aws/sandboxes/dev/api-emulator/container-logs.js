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
// function you feed raw chunks; it invokes onLine(line) for each finished line, buffering across
// chunks because both frames and lines can span chunk boundaries.
export function createDockerLogDemuxer(onLine) {
  let buf = Buffer.alloc(0)
  let line = ''

  const flush = (text) => {
    line += text
    let i
    while ((i = line.indexOf('\n')) >= 0) {
      onLine(line.slice(0, i).replace(/\r$/, ''))
      line = line.slice(i + 1)
    }
  }

  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    while (buf.length >= 8) {
      const size = buf.readUInt32BE(4)
      if (buf.length < 8 + size) break // wait for the rest of this frame's payload
      flush(buf.subarray(8, 8 + size).toString('utf8'))
      buf = buf.subarray(8 + size)
    }
  }
}
