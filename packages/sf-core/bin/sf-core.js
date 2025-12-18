#!/usr/bin/env node
import fs from 'fs'
import gracefulFs from 'graceful-fs'
import './blankLine.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { log, progress } from '@serverless/util'
import ServerlessCore from '../src/index.js'

import { extractCommandsAndOptions } from '../src/utils/cli/cli.js'

gracefulFs.gracefulify(fs)

/**
 * CLI Entry Point
 */
const run = async () => {
  // Parse the command line arguments
  const argv = yargs(hideBin(process.argv))
    .scriptName('serverless')
    .usage('$0 <cmd> [args]')
    .parserConfiguration({
      'parse-numbers': false,
      'camel-case-expansion': false,
    })
    .array('param') // Always parse --param as an array
    .version(false)
    .help(false).argv
  // Sanitize the command line arguments
  const { command, options } = extractCommandsAndOptions(argv)
  await ServerlessCore.run({
    command,
    options,
    debug: options.debug,
    verbose: options.verbose,
  })
}

export const errorHandler = (error) => {
  // Remove all Progress renderers
  progress.cleanup()

  // Log the error
  const logger = log.get('cli-error-handler')
  logger.debug(error)

  if (error.code) {
    delete error.code
  }
  // Insert blank lines before and after for better readability
  log.blankLine()
  log.error(error)
  log.blankLine()
  if (error.stack) {
    log.aside('For help, try the following:')
    log.aside('  • Run the command again with the "--debug" option')
    log.aside('  • Run "serverless support"')
    log.aside('  • Review the docs: https://www.serverless.com/framework/docs/')
    log.blankLine()
  }
  process.exit(1)
}
run()
  .catch(errorHandler)
  .finally(() => {
    // Remove all Progress renderers
    progress.cleanup()
  })

process.once('uncaughtException', errorHandler)
process.once('unhandledRejection', errorHandler)
