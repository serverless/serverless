import { log, progress } from '@serverless/util'

/**
 * Prints the error a command ended with: every spinner goes first, then one blank line, the
 * error, and one blank line after it (plus where to get help for an error with a stack). The
 * blank line before may be there already, as the one a spinner keeps above itself: `gap()`
 * prints none then.
 */
export const printError = (error) => {
  // Remove all Progress renderers
  progress.cleanup()

  // Log the error
  const logger = log.get('cli-error-handler')
  logger.debug(error)

  if (error.code) {
    delete error.code
  }
  log.gap()
  log.error(error)
  log.blankLine()
  if (error.stack) {
    log.aside('For help, try the following:')
    log.aside('  • Run the command again with the "--debug" option')
    log.aside('  • Review the docs: https://www.serverless.com/framework/docs/')
    log.blankLine()
  }
}
