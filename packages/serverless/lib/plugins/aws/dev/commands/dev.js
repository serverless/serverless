/**
 * `serverless dev` in functions mode: which run this is (a dry run, a session started in the
 * background with --detach, or a session in this terminal, which is also what the background
 * session process runs). Option combinations that mean nothing are refused before anything runs.
 * The foreground `--json` refusal happens before this, in the plugin's option checks.
 */
import { ServerlessError } from '@serverless/util'
import { runDevSession } from '../attach/session.js'
import { parseIdleTimeout } from '../attach/session-idle.js'
import { runDetach } from './detach.js'
import { runDevDryRun } from './dry-run.js'
import { cliCommand } from './cli-names.js'
import {
  envelope,
  errorResult,
  exitCodeOf,
  jsonRequested,
  printResult,
} from './envelope.js'

const combinationError = (message) =>
  new ServerlessError(message, 'DEV_MODE_INVALID_OPTION_COMBINATION', {
    stack: false,
  })

/** Throws for an --on-exit value other than keep or remove. */
export const validateOnExit = (options) => {
  const onExit = options['on-exit']
  if (onExit === undefined) return
  if (!['keep', 'remove'].includes(onExit)) {
    throw new ServerlessError(
      'Option "--on-exit" must be "keep" or "remove".',
      'INVALID_DEV_ON_EXIT_OPTION',
      { stack: false },
    )
  }
}

/**
 * Throws for a bad --on-exit, an option combination that means nothing, or a bad --idle-timeout:
 * with --json each is the envelope, like every other refusal of the command.
 */
export const validateDevOptions = (options) => {
  validateOnExit(options)
  if (options.detach && options['dry-run']) {
    throw combinationError(
      '--detach and --dry-run do not go together: a dry run changes nothing and ends at once.',
    )
  }
  if (options.detach && options['on-exit'] === 'remove') {
    throw combinationError(
      `--on-exit remove does not go with --detach: removing the service asks for confirmation at a terminal, which a session in the background does not have. Use --on-exit keep, or run "${cliCommand('remove')}" after "${cliCommand('dev stop')}".`,
    )
  }
  if (
    options['idle-timeout'] !== undefined &&
    !options.detach &&
    !options['session-process']
  ) {
    throw combinationError(
      '--idle-timeout works only with --detach: a session in a terminal never stops on its own.',
    )
  }
  if (options['idle-timeout'] !== undefined) {
    parseIdleTimeout(options['idle-timeout'])
  }
}

/** Runs `serverless dev` in functions mode and resolves its exit code. */
export const runDevCommand = async ({
  serverless,
  provider,
  options,
  logger,
  deps = {},
}) => {
  const {
    runSession = runDevSession,
    runDryRun = runDevDryRun,
    runDetach: launch = runDetach,
    stdout = process.stdout,
  } = deps
  const finish = ({ result, human }) => {
    printResult({ json: jsonRequested(options), result, human, logger, stdout })
    return exitCodeOf(result)
  }
  try {
    validateDevOptions(options)
  } catch (error) {
    if (!jsonRequested(options)) throw error
    const result = envelope(errorResult(error))
    return finish({ result, human: result.message })
  }
  if (options['dry-run']) {
    return finish(await runDryRun({ serverless, provider, options }))
  }
  if (options.detach && !options['session-process']) {
    return finish(await launch({ serverless, provider, options, logger }))
  }
  logger.logoDevMode()
  logger.blankLine()
  return runSession({ serverless, provider, options })
}
