/**
 * How the commands and files Dev Mode prints are named, so that they work where the developer
 * typed the first command. A service of a Compose project started from the project's root
 * (`serverless <service> dev`) names the service in every command it suggests, and its folder in
 * every file path; a `--config` the command was given goes with every suggested command. One CLI
 * process runs one Dev Mode command on one service: the plugin sets the names when that command
 * starts (`setCliNames`), and every line built after that reads them.
 */
import path from 'path'
import {
  commandFor,
  composeServiceOf,
  configOf,
  shellWord,
  withConfig,
} from '../../lib/cli-command.js'

export { commandFor, shellWord }

// The Compose service the command runs on, the service's folder as seen from the directory the
// CLI runs in ('' when it is that directory), and the configuration file the command was given.
let service = null
let folder = ''
let config = null

/**
 * Sets the names from the run's `serverless` instance, the options of its command and the
 * directory the CLI runs in.
 */
export const setCliNames = ({
  serverless,
  options = {},
  cwd = process.cwd(),
} = {}) => {
  service = composeServiceOf(serverless)
  const relative = serverless?.serviceDir
    ? path.relative(cwd, serverless.serviceDir)
    : ''
  // Another drive on Windows has no relative path: the absolute one is kept as it is.
  folder = path.isAbsolute(relative)
    ? relative
    : relative.split(path.sep).join('/')
  config = configOf(serverless, options)
}

export const resetCliNames = () => {
  service = null
  folder = ''
  config = null
}

/**
 * A Framework command as it runs here: `cliCommand('dev stop')` is `serverless <service> dev
 * stop` from a Compose root, with the `--config` the command was given.
 */
export const cliCommand = (command) =>
  withConfig(commandFor(service, command), config)

/** A path relative to the service directory, as it is reached from here. */
export const shownPath = (relative) =>
  folder ? `${folder}/${relative}` : relative
