/**
 * How the laptop half of the relay sends a streamed result: its start, its body as numbered data
 * frames (small writes coalesced, large ones split, a bounded window waiting for acknowledgement)
 * and its end with the trailers.
 */
import { KIND, STREAM_CHUNK_BYTES } from './protocol.js'
import { EMPTY, failure } from './relay-send.js'

/** How long a stream's small writes wait to share one data frame. */
export const STREAM_COALESCE_MS = 25
/** Stream data frames waiting for their acknowledgement, per stream. */
export const STREAM_WINDOW = 8
/**
 * The largest part of a stream sent as one object in the deployment bucket, when one handler write
 * is larger than a data frame: well under the largest object the bridge downloads (6 MiB and
 * 64 KiB, the sealed frame included).
 */
export const STREAM_OBJECT_BYTES = 4 * 1024 * 1024

/** Pieces of one large write: objects in the deployment bucket when it can be used, else frames. */
const piecesOf = (data, objects) => {
  const size = objects ? STREAM_OBJECT_BYTES : STREAM_CHUNK_BYTES
  const pieces = []
  for (let at = 0; at < data.length; at += size) {
    pieces.push(data.subarray(at, at + size))
  }
  return pieces
}

/**
 * `sendOrFail` and `spareUpload` are the relay's (relay-send.js); `coalescing` is the relay's set
 * of streams waiting to send their small writes together, which its drain flushes at once;
 * `isDraining()` says whether the drain began (small writes are then sent at once).
 */
export const createStreamSender = ({
  sendOrFail,
  spareUpload,
  sideChannel,
  timers,
  coalescing,
  isDraining,
}) => {
  /**
   * Sends a stream's body as data frames: small writes wait up to STREAM_COALESCE_MS to share a
   * frame of at most STREAM_CHUNK_BYTES, a larger write is split, and at most STREAM_WINDOW frames
   * wait for their acknowledgement at a time (the handler's stream is paused meanwhile). Resolves
   * with the number of frames once the body ended and every frame was sent; rejects at the first
   * failure, after which whatever the handler still writes is read and dropped, so it is never
   * blocked by a stream nobody sends.
   */
  const sendStreamBody = (environmentId, body, id, deadline, stream) =>
    new Promise((resolve, reject) => {
      let next = 0
      let pending = []
      let pendingBytes = 0
      let timer = null
      let queue = []
      const inFlight = new Set()
      let paused = false
      let ended = false
      let settled = false
      const self = {}

      const stopTimer = () => {
        if (timer === null) return
        timers.clearTimeout(timer)
        timer = null
        coalescing.delete(self)
      }
      const fail = (error) => {
        if (settled) return
        settled = true
        stopTimer()
        pending = []
        queue = []
        if (paused) body.resume()
        paused = false
        reject(error)
      }
      const maybeDone = () => {
        if (settled || !ended || queue.length || inFlight.size) return
        settled = true
        resolve(next)
      }
      const sendPiece = (piece) => {
        const n = next
        next += 1
        const header = { kind: KIND.STREAM_DATA, id, n }
        const options = { priority: 'data', deadline }
        const what = 'part of its stream'
        const sending =
          piece.length > STREAM_CHUNK_BYTES
            ? new Promise((resolve) => resolve(sideChannel.upload(piece))).then(
                (s3) =>
                  sendOrFail(what, environmentId, { ...header, s3 }, EMPTY, {
                    ...options,
                  }),
                (error) => {
                  throw failure(
                    'Dev Mode could not upload part of its stream to the deployment bucket',
                    error,
                  )
                },
              )
            : sendOrFail(what, environmentId, header, piece, options)
        inFlight.add(sending)
        sending.then(
          () => {
            stream.sent[n] = true
            inFlight.delete(sending)
            pump()
          },
          (error) => {
            inFlight.delete(sending)
            fail(error)
          },
        )
      }
      const pump = () => {
        if (settled) return
        while (queue.length && inFlight.size < STREAM_WINDOW) {
          sendPiece(queue.shift())
        }
        const full = queue.length > 0 || inFlight.size >= STREAM_WINDOW
        if (full && !paused) {
          paused = true
          body.pause()
        } else if (!full && paused) {
          paused = false
          body.resume()
        }
        maybeDone()
      }
      const flush = () => {
        stopTimer()
        if (!pendingBytes) return
        queue.push(Buffer.concat(pending))
        pending = []
        pendingBytes = 0
      }
      self.flushNow = () => {
        flush()
        pump()
      }
      const take = (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        if (pendingBytes + data.length > STREAM_CHUNK_BYTES) flush()
        if (data.length >= STREAM_CHUNK_BYTES) {
          queue.push(...piecesOf(data, sideChannel.enabled))
        } else {
          pending.push(data)
          pendingBytes += data.length
          if (pendingBytes >= STREAM_CHUNK_BYTES) {
            flush()
          } else if (timer === null && !isDraining()) {
            timer = timers.setTimeout(() => {
              timer = null
              coalescing.delete(self)
              self.flushNow()
            }, STREAM_COALESCE_MS)
            coalescing.add(self)
          } else if (isDraining()) {
            flush()
          }
        }
        pump()
      }
      body.on('data', (chunk) => {
        if (settled) return
        try {
          take(chunk)
        } catch (error) {
          fail(
            failure("Dev Mode could not send this invocation's stream", error),
          )
        }
      })
      body.on('end', () => {
        ended = true
        self.flushNow()
      })
      body.on('error', (error) =>
        fail(
          failure("Dev Mode could not read this invocation's stream", error),
        ),
      )
      body.on('close', () => {
        if (!ended) {
          fail(
            new Error(
              "Dev Mode could not read this invocation's stream: it closed before it ended",
            ),
          )
        }
      })
    })

  const sendStream = async (environmentId, reply, id, deadline, stream) => {
    stream.started = true
    await sendOrFail(
      'the start of its stream',
      environmentId,
      {
        kind: KIND.STREAM_START,
        id,
        ...(typeof reply.contentType === 'string' && {
          contentType: reply.contentType,
        }),
      },
      EMPTY,
      { deadline },
    ).catch((error) => {
      // The body is still read, so the handler is never blocked by a stream nobody sends.
      reply.body.on('error', () => {})
      reply.body.resume()
      throw error
    })
    stream.startSent = true
    const count = await sendStreamBody(
      environmentId,
      reply.body,
      id,
      deadline,
      stream,
    )
    const trailers = (await reply.ended) ?? {}
    const upload = await spareUpload()
    await sendOrFail(
      'the end of its stream',
      environmentId,
      {
        kind: KIND.STREAM_END,
        id,
        count,
        ...(typeof trailers.errorType === 'string' &&
          trailers.errorType && {
            errorType: trailers.errorType,
            ...(typeof trailers.errorBody === 'string' && {
              errorBody: trailers.errorBody,
            }),
          }),
        ...(upload && { upload }),
      },
      EMPTY,
      { deadline },
    )
  }

  return { sendStream }
}
