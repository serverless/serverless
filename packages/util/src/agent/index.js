/**
 * AI coding agent detection.
 *
 * Wraps @vercel/detect-agent (maintained list of agent environment variables) and runs once per
 * process. Two signals the library accepts also appear in ordinary human sessions, so they are
 * ignored unless another agent variable backs them: REPL_ID (set in every Replit shell) counts
 * only with AI_AGENT, and COPILOT_GITHUB_TOKEN (developers export it for other tools) counts only
 * with AI_AGENT, COPILOT_MODEL or COPILOT_ALLOW_ALL. Never throws and never waits longer than
 * DETECTION_TIMEOUT_MS: a detection failure or timeout means "no agent".
 */
import { determineAgent } from '@vercel/detect-agent'

export const KNOWN_AGENT_NAMES = Object.freeze([
  'claude',
  'cowork',
  'cursor',
  'cursor-cli',
  'codex',
  'gemini',
  'github-copilot',
  'devin',
  'opencode',
  'antigravity',
  'augment-cli',
  'replit',
  'v0',
])

// AI_AGENT values carry a known name as a prefix ("claude-code_2-1-284_agent" → "claude",
// "github_copilot_vscode_agent" → "github-copilot", "devin_<ver>_agent" → "devin"); aliases
// cover prefixes that are not themselves known names.
const PREFIX_ALIASES = [['copilot', 'github-copilot']]

// Longest first, so "cursor-cli" wins over "cursor".
const NAMES_BY_LENGTH = [...KNOWN_AGENT_NAMES].sort(
  (a, b) => b.length - a.length,
)

const NOT_AN_AGENT = Object.freeze({ isAgent: false, name: undefined })

let cached = null
let pending = null

const matchesPrefix = (value, prefix) =>
  value === prefix || value.startsWith(`${prefix}-`)

export const normalizeAgentName = (raw) => {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  if (!value) return 'other'
  for (const [prefix, name] of PREFIX_ALIASES) {
    if (matchesPrefix(value, prefix)) return name
  }
  return NAMES_BY_LENGTH.find((name) => matchesPrefix(value, name)) ?? 'other'
}

// Known limitation: the library returns only its first match, so a filtered match hides any
// signal it would have checked later (e.g. REPL_ID with COPILOT_MODEL and no AI_AGENT is treated
// as not an agent).
const isHumanSessionSignal = (name, env) => {
  // Trimmed like the library, so a blank AI_AGENT does not back REPL_ID
  if (env.AI_AGENT?.trim()) return false
  if (name === 'replit') return true
  if (
    name === 'github-copilot' &&
    env.COPILOT_GITHUB_TOKEN &&
    !env.COPILOT_MODEL &&
    !env.COPILOT_ALLOW_ALL
  ) {
    return true
  }
  return false
}

// Every command waits for detection, so it is bounded: the library's checks are environment reads
// and one local file check, and a check that never settles must not stall or silently end the
// command. After the timeout the session is treated as a person's.
export const DETECTION_TIMEOUT_MS = 1000

// Why the last detection fell back to "not an agent" (an error or the timeout), for --debug.
let lastDetectionError = null

const toError = (value) => {
  if (value instanceof Error) return value
  try {
    return new Error(String(value))
  } catch {
    return new Error('unknown error')
  }
}

// The timer is deliberately left ref'd: it keeps Node running until detection settles or times
// out, and it is cleared as soon as either happens.
const withTimeout = (promise, timeoutMs) => {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs} ms`)),
      timeoutMs,
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export const detectAgent = async (options) => {
  // Only a finite positive timeout is used: Infinity or a bad value would make setTimeout warn and
  // fire at once, so those fall back to the default.
  const { timeoutMs: givenTimeout } = options ?? {}
  const timeoutMs =
    Number.isFinite(givenTimeout) && givenTimeout > 0
      ? givenTimeout
      : DETECTION_TIMEOUT_MS
  if (cached) return cached
  if (!pending) {
    pending = (async () => {
      try {
        const result = await withTimeout(determineAgent(), timeoutMs)
        if (!result?.isAgent) return NOT_AN_AGENT
        const name = normalizeAgentName(result.agent?.name)
        if (isHumanSessionSignal(name, process.env)) return NOT_AN_AGENT
        return Object.freeze({ isAgent: true, name })
      } catch (error) {
        lastDetectionError = toError(error)
        return NOT_AN_AGENT
      }
    })()
  }
  cached = await pending
  return cached
}

export const getDetectedAgent = () => cached ?? NOT_AN_AGENT

export const getAgentDetectionError = () => lastDetectionError

export const resetAgentDetectionForTests = () => {
  cached = null
  pending = null
  lastDetectionError = null
}

/**
 * Whether colour output should be turned off: an AI coding agent (the detected one unless `agent`
 * is given), FORCE_COLOR not set (any value set is the user's choice, which chalk already honours),
 * and SLS_INTERACTIVE_SETUP_ENABLE not set (the escape hatch for a person wrongly detected as an
 * agent restores the human session, colours included). The logger and every other chalk instance
 * use this one rule; call it at first use, after detectAgent() has run.
 */
export const shouldDisableColors = (options) => {
  const { env: givenEnv, agent = getDetectedAgent() } = options ?? {}
  // Anything but an object (null included) means the process environment.
  const env =
    givenEnv !== null && typeof givenEnv === 'object' ? givenEnv : process.env
  return (
    Boolean(agent?.isAgent) &&
    !('FORCE_COLOR' in env) &&
    !env.SLS_INTERACTIVE_SETUP_ENABLE
  )
}
