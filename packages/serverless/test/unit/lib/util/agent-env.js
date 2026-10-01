// Shared by the agent-detection tests of @serverless/framework and @serverlessinc/sf-core.
// Every environment variable @vercel/detect-agent reads. Tests clear them so a case never depends
// on the AI coding agent (or none) that runs jest; when a library update reads a new variable,
// add it here.
import { existsSync } from 'node:fs'

export const AGENT_ENV_VARS = Object.freeze([
  'AI_AGENT',
  'ANTIGRAVITY_AGENT',
  'AUGMENT_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE',
  'CLAUDE_CODE_IS_COWORK',
  'CODEX_CI',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'COPILOT_ALLOW_ALL',
  'COPILOT_GITHUB_TOKEN',
  'COPILOT_MODEL',
  'CURSOR_AGENT',
  'CURSOR_EXTENSION_HOST_ROLE',
  'CURSOR_TRACE_ID',
  'GEMINI_CLI',
  'OPENCODE_CLIENT',
  'REPL_ID',
])

// The library also treats an existing /opt/.devin as Devin, so a case that expects "no agent"
// from a clean environment cannot pass on such a machine.
export const hasDevinMarker = () => existsSync('/opt/.devin')

/**
 * Removes every agent variable from process.env and returns a function that restores the
 * environment as it was before the call.
 */
export const clearAgentEnv = () => {
  const saved = { ...process.env }
  for (const name of AGENT_ENV_VARS) delete process.env[name]
  return () => {
    process.env = saved
  }
}
