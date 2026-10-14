#!/usr/bin/env node
import fs from 'fs'
import gracefulFs from 'graceful-fs'
import { startsWithBlankLine } from './blankLine.js'
import { hideBin } from 'yargs/helpers'
import { noteStartupBlankLine, progress } from '@serverless/util'
import ServerlessCore from '../src/index.js'
import { printError } from './print-error.js'

import {
  extractCommandsAndOptions,
  parseCommandLine,
} from '../src/utils/cli/cli.js'

gracefulFs.gracefulify(fs)

// The blank line the CLI starts with (on stdout) is above the first line of stderr only when both
// show on one terminal; in a pipe or a file the two may be read apart.
noteStartupBlankLine(
  startsWithBlankLine(process.argv) &&
    process.stdout.isTTY &&
    process.stderr.isTTY,
)

/**
 * CLI Entry Point
 */
const run = async () => {
  // Parse the command line arguments
  const argv = parseCommandLine(hideBin(process.argv))
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
  printError(error)
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
