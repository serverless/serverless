/**
 * Turns a handler process's output into the lines the terminal shows. A line ends with LF or CRLF.
 * Output that does not end a line (a progress bar redrawn with carriage returns, a prompt) is shown
 * once it has waited `flushMs`, or in pieces of `limit` characters when it grows that long, so it
 * is never held back for good. A line shows what a terminal would leave of it: the text after its
 * last carriage return. Each character is scanned and joined once, whatever the chunks look like.
 */
export const PARTIAL_LINE_FLUSH_MS = 500
export const PARTIAL_LINE_LIMIT = 64 * 1024

const visible = (text) => {
  if (!text.includes('\r')) return text
  const segments = text.split('\r').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

export const createLineSplitter = ({
  timers,
  onLine,
  flushMs = PARTIAL_LINE_FLUSH_MS,
  limit = PARTIAL_LINE_LIMIT,
  // Who wrote what is pushed now (the request id of the running invocation): a line is told with
  // the one current when its first part arrived.
  context = () => undefined,
}) => {
  // The line not ended yet, as the chunks it arrived in, and who wrote its first part.
  let pending = []
  let pendingLength = 0
  let pendingOwner
  // Part of the current line was shown already (by whom): an empty rest of it is not a line of its
  // own, and the rest keeps that part's owner.
  let shownPart = false
  let shownOwner
  let timer = null
  let ended = false

  const clearTimer = () => {
    timers.clearTimeout(timer)
    timer = null
  }
  const takePending = () => {
    const text = pending.join('')
    pending = []
    pendingLength = 0
    return text
  }
  const showPart = (text, owner) => {
    const shown = visible(text)
    if (!shown) return
    onLine(shown, owner)
    shownPart = true
    shownOwner = owner
  }
  const flush = () => {
    clearTimer()
    if (pendingLength) showPart(takePending(), pendingOwner)
  }

  return {
    push(chunk) {
      const text = String(chunk)
      const current = context()
      // The owner of the line this chunk continues, or the invocation running now.
      const ownerOfNew = () => (shownPart ? shownOwner : current)
      let start = 0
      for (
        let index = text.indexOf('\n');
        index !== -1;
        index = text.indexOf('\n', start)
      ) {
        const piece = text.slice(start, index)
        const owner = pendingLength ? pendingOwner : ownerOfNew()
        const whole = pendingLength ? takePending() + piece : piece
        const line = whole.endsWith('\r') ? whole.slice(0, -1) : whole
        if (!(shownPart && line === '')) onLine(visible(line), owner)
        shownPart = false
        start = index + 1
      }
      if (start < text.length) {
        if (!pendingLength) pendingOwner = ownerOfNew()
        pending.push(text.slice(start))
        pendingLength += text.length - start
      }
      if (pendingLength >= limit) {
        const long = takePending()
        let at = 0
        for (; at + limit <= long.length; at += limit) {
          showPart(long.slice(at, at + limit), pendingOwner)
        }
        if (at < long.length) {
          pending.push(long.slice(at))
          pendingLength = long.length - at
        }
      }
      if (!pendingLength) clearTimer()
      else if (ended) flush()
      else if (!timer) {
        timer = timers.setTimeout(() => {
          timer = null
          flush()
        }, flushMs)
      }
    },
    /** The output ended (or its process exited): what is left is shown, and anything later at once. */
    end() {
      ended = true
      flush()
    },
  }
}
