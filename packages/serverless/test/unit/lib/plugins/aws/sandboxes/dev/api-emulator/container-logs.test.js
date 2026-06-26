// Demuxer for Docker's multiplexed log stream → clean lines. Pure; no Docker.
import {
  createDockerLogDemuxer,
  shortMicrovmId,
} from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/container-logs.js'

test('shortMicrovmId trims the microvm- prefix to 8 chars for readable log tags', () => {
  expect(shortMicrovmId('microvm-75e525bb-ad71-4caf-8dc7-6d5d6d6149ba')).toBe(
    '75e525bb',
  )
  expect(shortMicrovmId('mvm-1')).toBe('mvm-1') // no microvm- prefix → first 8 chars
  expect(shortMicrovmId(undefined)).toBe('')
})

// Build one multiplexed frame: [type][0,0,0][size BE32][payload].
function frame(type, text) {
  const payload = Buffer.from(text, 'utf8')
  const header = Buffer.alloc(8)
  header[0] = type // 1=stdout, 2=stderr
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

test('emits a single complete line from one stdout frame', () => {
  const lines = []
  const feed = createDockerLogDemuxer((l) => lines.push(l))
  feed(frame(1, 'worker: hook server listening on 0.0.0.0:9000\n'))
  expect(lines).toEqual(['worker: hook server listening on 0.0.0.0:9000'])
})

test('splits multiple lines in one frame; strips trailing \\r', () => {
  const lines = []
  const feed = createDockerLogDemuxer((l) => lines.push(l))
  feed(frame(1, 'line one\r\nline two\n'))
  expect(lines).toEqual(['line one', 'line two'])
})

test('buffers a partial line until its newline arrives (across frames)', () => {
  const lines = []
  const feed = createDockerLogDemuxer((l) => lines.push(l))
  feed(frame(1, 'looking for '))
  expect(lines).toEqual([]) // no newline yet
  feed(frame(1, 'work item\n'))
  expect(lines).toEqual(['looking for work item'])
})

test('reassembles a frame whose header/payload is split across chunks', () => {
  const lines = []
  const feed = createDockerLogDemuxer((l) => lines.push(l))
  const f = frame(1, 'hello world\n')
  feed(f.subarray(0, 3)) // partial header
  feed(f.subarray(3, 10)) // rest of header + part of payload
  feed(f.subarray(10)) // remainder
  expect(lines).toEqual(['hello world'])
})

test('demuxes interleaved stdout (1) and stderr (2) frames', () => {
  const lines = []
  const feed = createDockerLogDemuxer((l) => lines.push(l))
  feed(Buffer.concat([frame(1, 'out line\n'), frame(2, 'err line\n')]))
  expect(lines).toEqual(['out line', 'err line'])
})
