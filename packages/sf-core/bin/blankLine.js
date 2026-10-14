import { jsonInArgs } from '@serverless/util/src/cli/json-flag.js'

// Always start with a blank line, for readability. A command run with --json prints one JSON
// result as the only thing on stdout, so it starts without one.
export const startsWithBlankLine = (argv) => !jsonInArgs(argv.slice(2))

if (startsWithBlankLine(process.argv)) console.log('')
