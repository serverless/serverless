/**
 * How the laptop half of the relay sends frames to one execution environment's bridge (its `down`
 * topic): sealed for that topic, through the connection's publish, with a deadline. A buffered
 * result travels in one frame, or in the deployment bucket when it is larger than one message;
 * an accepted request whose relaying failed is answered with Runtime.DevModeRelayFailed.
 */
import { KIND, fitsOneMessage } from './protocol.js'
import { withoutSecrets } from './redact.js'

export const RELAY_FAILED = 'Runtime.DevModeRelayFailed'
export const EMPTY = Buffer.alloc(0)

export const describe = (error) => withoutSecrets(error?.message ?? error)
export const failure = (what, error) => new Error(`${what}: ${describe(error)}`)

const errorJson = (errorMessage) =>
  Buffer.from(JSON.stringify({ errorType: RELAY_FAILED, errorMessage }))

/**
 * `topics` and `seal` are the session's; `publish` is the connection's; `debug` never throws.
 * Returns the send steps the relay and its streams share.
 */
export const createSender = ({ topics, seal, publish, sideChannel, debug }) => {
  /**
   * Publishes one frame to an execution environment: resolves true once sent, false when its
   * deadline passed first, and rejects when the publish failed.
   */
  const publishFrame = (
    environmentId,
    header,
    body = EMPTY,
    { priority = 'control', deadline, onDropped } = {},
  ) =>
    new Promise((resolve) => {
      const topic = topics.down(environmentId)
      resolve(
        publish({
          topic,
          payload: seal(topic, header, body),
          priority,
          deadline,
          ...(onDropped && { onDropped }),
        }),
      )
    })

  /** Publishes a frame whose failure nothing can follow up: it is logged. */
  const trySend = async (environmentId, header, body, options) => {
    try {
      const sent = await publishFrame(environmentId, header, body, options)
      if (sent !== true) {
        debug(
          `Dev Mode did not send ${header.kind} for ${header.id}: its deadline passed first`,
        )
      }
      return sent === true
    } catch (error) {
      debug(
        `Dev Mode could not send ${header.kind} for ${header.id}: ${describe(error)}`,
      )
      return false
    }
  }

  // A presigned PUT for the bridge's next large event; signing is asynchronous.
  const spareUpload = async () => {
    if (!sideChannel.enabled) return undefined
    try {
      return (await sideChannel.uploadUrl()) ?? undefined
    } catch (error) {
      debug(`Dev Mode could not sign an upload URL: ${describe(error)}`)
      return undefined
    }
  }

  /** Publishes part of a result; anything but a sent frame is a failure of the relay. */
  const sendOrFail = async (what, environmentId, header, body, options) => {
    let sent
    try {
      sent = await publishFrame(environmentId, header, body, options)
    } catch (error) {
      throw failure(`Dev Mode could not send ${what}`, error)
    }
    if (sent !== true) {
      throw new Error(`Dev Mode could not send ${what} before its deadline`)
    }
  }

  const sendBuffered = async (environmentId, reply, id, deadline) => {
    const header = {
      kind: reply.kind,
      id,
      ...(typeof reply.contentType === 'string' && {
        contentType: reply.contentType,
      }),
      ...(typeof reply.errorType === 'string' && {
        errorType: reply.errorType,
      }),
    }
    const body = Buffer.from(reply.body ?? EMPTY)
    const what = "this invocation's result"
    if (fitsOneMessage(header, body)) {
      const upload = await spareUpload()
      const withSpare = upload ? { ...header, upload } : header
      await sendOrFail(
        what,
        environmentId,
        fitsOneMessage(withSpare, body) ? withSpare : header,
        body,
        { deadline },
      )
      return
    }
    if (!sideChannel.enabled) {
      throw new Error(
        `The result is ${body.length} bytes, more than one AWS IoT Core message, and Dev Mode cannot use the deployment bucket for it: ${sideChannel.reason}.`,
      )
    }
    let s3
    try {
      s3 = await sideChannel.upload(body)
    } catch (error) {
      throw failure(
        "Dev Mode could not upload this invocation's result to the deployment bucket",
        error,
      )
    }
    const upload = await spareUpload()
    await sendOrFail(
      what,
      environmentId,
      { ...header, s3, ...(upload && { upload }) },
      EMPTY,
      { deadline },
    )
  }

  /**
   * Answers an accepted request whose relaying failed with Runtime.DevModeRelayFailed: a stream
   * gets it in its end's trailers, counting the frames sent before the failure; anything else, or a
   * stream whose start may not have reached the bridge, gets an error frame.
   */
  const sendFailure = async (environmentId, id, stream, message, deadline) => {
    debug(`Dev Mode could not relay ${id}: ${message}`)
    const body = errorJson(message)
    if (stream.started) {
      let count = 0
      while (stream.sent[count]) count += 1
      await trySend(
        environmentId,
        {
          kind: KIND.STREAM_END,
          id,
          count,
          errorType: RELAY_FAILED,
          errorBody: body.toString('base64'),
        },
        EMPTY,
        { deadline },
      )
      if (stream.startSent) return
    }
    await trySend(
      environmentId,
      { kind: KIND.ERROR, id, errorType: RELAY_FAILED },
      body,
      { deadline },
    )
  }

  return {
    publishFrame,
    trySend,
    spareUpload,
    sendOrFail,
    sendBuffered,
    sendFailure,
  }
}
