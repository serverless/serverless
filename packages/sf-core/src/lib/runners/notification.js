import {
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import {
  getRcNotificationLastShown,
  setRcNotificationLastShown,
} from '../../utils/index.js'

/**
 * Normalize input into an array of notifications with a stable shape.
 * Keeps only fields used by the CLI.
 */
export function sanitizeNotifications(input) {
  if (!Array.isArray(input)) return []
  const normalized = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const n = raw
    n.behavior = n.behavior || {}
    n.shown = false
    normalized.push(n)
  }
  // Keep non-blocking notifications in their original order but move blockers to the end
  // so that all informational messages render before any blocking warning is surfaced/thrown.
  normalized.sort((a, b) => {
    const aBlocking = a?.behavior?.block === true
    const bBlocking = b?.behavior?.block === true
    if (aBlocking === bBlocking) return 0
    return aBlocking ? 1 : -1
  })
  normalized.push(...getBuiltInNotifications())
  return normalized
}

/**
 * Render notifications, apply throttling rules, and throw for blocking notifications
 * on specific commands.
 *
 * Rules:
 * - Non-blocking: show at most once/day per id.
 * - Blocking: always enforced on the following commands:
 *   - deploy (including all subcommands like 'deploy function')
 *   - package
 * - Show all blocking notifications except the last one, which is thrown
 *   (to avoid duplicate output). All displayed notifications are marked as shown.
 * - The thrown one is also marked as shown.
 */
export async function handleAndMaybeThrowNotifications({
  notifications,
  command,
}) {
  const topLevel = command?.[0]
  const deferredNotifications = []

  // Check if this is a blockable command
  // Blocked commands: 'deploy' (all subcommands), 'package'
  const isBlockableCommand = topLevel === 'deploy' || topLevel === 'package'

  // Identify blocking notifications
  const blockingIndexes = []
  for (let i = 0; i < notifications.length; i++) {
    if (notifications[i]?.behavior?.block === true) blockingIndexes.push(i)
  }
  const hasBlocking = blockingIndexes.length > 0
  const lastBlockingIndex = hasBlocking
    ? blockingIndexes[blockingIndexes.length - 1]
    : -1
  const logImmediatelyForAll = isBlockableCommand && hasBlocking
  let immediateNotificationsEmitted = 0

  // Display notifications according to throttling/blocking rules
  for (let i = 0; i < notifications.length; i++) {
    const n = notifications[i]
    const id = n.id
    const behavior = n.behavior || {}

    const isBlocking = behavior?.block === true
    const isLastBlocking =
      isBlockableCommand && isBlocking && i === lastBlockingIndex

    // Throttle once per day for non-blocking; never throttle blocking
    let show = true
    if (!isBlocking && id) {
      const lastShown = await getRcNotificationLastShown({ id })
      if (lastShown) {
        const now = new Date()
        const msInDay = 24 * 60 * 60 * 1000
        if (now.getTime() - lastShown.getTime() < msInDay) {
          show = false
        }
      }
    }

    if (show && !isLastBlocking) {
      if (logImmediatelyForAll) {
        // When a blocking notification exists on a blockable command, display each
        // queued message immediately so the user sees all context before the throw.
        if (immediateNotificationsEmitted === 0) {
          // Ensure any active spinner/progress output is cleared before logging.
          progress.cleanup()
        } else {
          // Separate consecutive notifications with a blank line for readability.
          log.notice()
        }
        await emitNotification(n)
        immediateNotificationsEmitted += 1
      } else {
        // Non-blocking commands defer logging so messages appear near command completion.
        deferredNotifications.push(n)
      }
    }
  }

  // Throw if blocking is present on blockable commands
  if (hasBlocking && isBlockableCommand) {
    const lastBlocking = notifications[lastBlockingIndex]
    const primary = lastBlocking?.message || 'Operation blocked'
    const details = lastBlocking?.details
    const combinedMessage = details ? `${primary}\n${details}` : primary
    const thrownId = lastBlocking?.id
    if (thrownId) await setRcNotificationLastShown({ id: thrownId })
    lastBlocking.shown = true
    throw new ServerlessError(
      combinedMessage,
      ServerlessErrorCodes.general.COMMAND_BLOCKED_BY_NOTIFICATION,
      { stack: false },
    )
  }

  return { deferredNotifications }
}

export async function logDeferredNotifications(notifications = []) {
  if (!Array.isArray(notifications) || notifications.length === 0) return
  log.notice('\n------------------')
  for (const notification of notifications) {
    if (!notification || typeof notification !== 'object') continue
    log.notice()
    await emitNotification(notification)
  }
}

function normalizeNotificationLevel(notification) {
  const normalized =
    typeof notification?.level === 'string'
      ? notification.level.toLowerCase()
      : undefined
  if (normalized === 'error') return 'error'
  if (normalized === 'notice') return 'notice'
  if (normalized === 'warning' || normalized === 'warn') return 'warn'
  return undefined
}

async function emitNotification(notification) {
  if (!notification || typeof notification !== 'object') return
  const level = normalizeNotificationLevel(notification)
  if (!level) return
  const message =
    typeof notification.message === 'string' ? notification.message.trim() : ''
  const details =
    typeof notification.details === 'string' ? notification.details.trim() : ''

  switch (level) {
    case 'error':
      log.error(message)
      break
    case 'notice':
      log.notice(message)
      break
    default:
      log.warning(message)
  }

  if (details) log.aside(details)
  if (notification.id) await setRcNotificationLastShown({ id: notification.id })
  notification.shown = true
}

function getBuiltInNotifications() {
  // Add any hardcoded notifications here
  return []
}
