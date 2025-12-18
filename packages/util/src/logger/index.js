/**
 * Logger
 * Renders logs, progress, and more to the console,
 * with support for different log levels and styling.
 */

import util from 'util'
import Enquirer from 'enquirer'
import chalk from 'chalk'
import ora from 'ora'

const supportsColor = chalk.supportsColor

/**
 *
 * Renderer Global Settings
 *
 */
const renderer = {}
renderer.isInitialized = false
// Set up the state storage for namespaces and progress instances
renderer.state = {
  namespaces: new Map(),
  progressTasks: new Map(),
  // Store the last message printed to the console
  // Start with empty line since a blank line is always created upon start.
  lastToken: '',
}
// Color support level
renderer.colorSupportLevel =
  typeof supportsColor === 'object' ? supportsColor.level : 3
// Interactive setting
renderer.isInteractive =
  (process.stdin.isTTY &&
    process.stdout.isTTY &&
    typeof process.env.CI !== 'string') ||
  process.env.SLS_INTERACTIVE_SETUP_ENABLE
// Log levels
renderer.levels = {
  compose: 0, // This is for compose. It is the lowest log level to have full control over the CLI.
  error: 1, // This is for error messages
  warning: 2, // This is for warning messages
  notice: 3, // This is the default log level and is used for short and clear messages in the default CLI experience.
  info: 4, // This is for additional information that is helpful to know when running actions.
  debug: 5, // This is for system debugging information.
}
// Set global log level to "notice"
renderer.logLevel = 'notice'
/**
 * Global Spinner
 *
 * This is spinner is used to show loading progress, and it's
 * shared by all loggers. It's a singleton instance of the ora spinner.
 * It's wrapped in a spinner object to allow for starting, stopping, and updating,
 * easily.
 * It's handled by the writeProgress method.
 *
 * Please note, this spinner always tries to keep the line before it blank,
 * it does this via the lastToken property.
 */
renderer.spinner = {
  // Store the instance of the Ora spinner here
  _spinner: null,
  isInitialized: () => renderer.spinner._spinner != null,
  isSpinning: () =>
    renderer.spinner.isInitialized() && renderer.spinner._spinner.isSpinning,
  start: (
    { content, lineBreak = true, isComposeMessage = false } = {
      lineBreak: true,
    },
  ) => {
    /**
     * Only start if there are progress states to render
     */
    const progressStates = Array.from(renderer.state.progressTasks.values())
    const progressStatesWithMessages = progressStates.filter(
      (progressState) => progressState.message,
    )
    if (progressStatesWithMessages.length === 0) {
      return
    }

    if (renderer.logLevel === 'compose' && !isComposeMessage) {
      return
    }

    /**
     * Do not start if log level is not "notice" or "info"
     */
    if (
      renderer.logLevel !== 'compose' &&
      renderer.logLevel !== 'notice' &&
      renderer.logLevel !== 'info'
    ) {
      return
    }

    /**
     * When the log level is "notice", we try to keep the line before the spinner blank.
     * We do this by reviewing the last logged message, and ensuring the lineBreak is true.
     */
    if (
      renderer.state.lastToken !== '' &&
      lineBreak &&
      (renderer.logLevel === 'notice' || renderer.logLevel === 'compose')
    ) {
      console.log('')
      renderer.state.lastToken = ''
    }

    if (renderer.spinner.isInitialized()) {
      renderer.spinner._spinner.start()
    } else {
      renderer.spinner._spinner = ora({
        color: 'red',
        text: content,
        isEnabled: renderer.isInteractive,
      }).start()
    }
  },
  stop: () => {
    if (renderer.spinner._spinner) {
      renderer.spinner._spinner.stop()
      renderer.state.lastToken = ''
    }
  },
  update: ({ content, isComposeMessage = false } = {}) => {
    if (
      renderer.spinner.isInitialized() &&
      (isComposeMessage || renderer.logLevel !== 'compose')
    ) {
      renderer.spinner._spinner.text = content
    }
  },
}

// Colors
renderer.colors = {
  default: (param) => param,
  white: (param) => param,
  red:
    renderer.colorSupportLevel > 2 ? chalk.rgb(253, 87, 80) : chalk.redBright,
  yellow:
    renderer.colorSupportLevel > 2
      ? chalk.rgb(255, 165, 0)
      : chalk.yellowBright,
  green: chalk.green,
  gray: renderer.colorSupportLevel > 2 ? chalk.rgb(140, 141, 145) : chalk.gray,
  grey: renderer.colorSupportLevel > 2 ? chalk.rgb(140, 141, 145) : chalk.gray,
}
// Default styles
renderer.style = {
  bold: chalk.bold,
  debug: (text) => text,
  info: renderer.colors.default,
  notice: renderer.colors.default,
  warning: renderer.colors.gray,
  error: renderer.colors.red,
  aside: renderer.colors.gray,
  link: (text) => text, // Keep as is, no chalk styling
  linkStrong: chalk.underline,
  symbol: renderer.colors.red,
  strong: renderer.colors.red,
  title: chalk.underline,
}

/**
 * Maps a string to a "safe" color using chalk.
 * Useful for colorizing strings consistenyl based on their content.
 */
const stringToSafeColor = (str) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const base = 128
  const range = 127

  const red = base + (hash & range)
  const green = base + ((hash >> 8) & range)
  const blue = base + ((hash >> 16) & range)

  return chalk.rgb(red, green, blue)
}

/**
 * Colorize a string based on its "safe" color
 */
const colorizeString = (str) => {
  const colorFn = stringToSafeColor(str)
  return colorFn(str)
}

/**
 * Set the Renderer's global settings.
 */
const setGlobalRendererSettings = ({
  logLevel = null,
  isInteractive = null,
}) => {
  if (typeof logLevel === 'string') {
    if (renderer.levels[logLevel] === undefined) {
      throw new Error(`Invalid log level ${logLevel}.`)
    }
    renderer.logLevel = logLevel
  }
  if (typeof isInteractive === 'boolean') {
    renderer.isInteractive = isInteractive
  }
}

/**
 * Get the Renderer's global settings.
 */
const getGlobalRendererSettings = () => {
  return {
    logLevel: renderer.logLevel,
    isInteractive: renderer.isInteractive,
  }
}

/**
 * Handles writing logs to the stderr.
 * Only writes logs if the log level is less than or equal to the global log level.
 * If a prefix is provided, prepends it to the log message.
 * If a prefixColor is provided, applies the color to the prefix.
 * If a type is provided, applies the type styling to the log message.
 * If no type is provided, applies the default styling to the log message.
 */
const writeStdErr = ({
  level = renderer.logLevel,
  messageTokens = [],
  type = null,
  prefix = null,
  prefixColor = null,
  disableNewLine = null,
}) => {
  level = level || renderer.logLevel

  // If the log level is higher than the global log level, do not write the log
  if (renderer.levels[level] > renderer.levels[renderer.logLevel]) {
    return
  }

  // Stop the spinner to not collide with log output
  renderer.spinner.stop()

  // Process the message tokens
  let formattedMessage = ''

  // Remove first token
  const firstToken = messageTokens.shift()

  // Check if firstToken is actually a string and contains placeholders
  if (typeof firstToken === 'string' && /%[sd]/.test(firstToken)) {
    // Replace format specifiers with values from the messageTokens
    formattedMessage = firstToken.replace(/%s|%d/g, () => {
      const token = messageTokens.shift()
      if (typeof token === 'object' && token !== null) {
        return util.inspect(token, { colors: true, depth: null })
      }
      return token
    })
  } else {
    // Often empty messages are used to create blank lines
    if (firstToken === undefined) {
      formattedMessage = ''
    } else if (firstToken instanceof Error) {
      formattedMessage = firstToken.stack
        ? firstToken.stack
        : firstToken.message
    } else if (typeof firstToken === 'object' && firstToken !== null) {
      formattedMessage = util.inspect(firstToken, {
        colors: true,
        depth: null,
      })
    } else {
      formattedMessage = firstToken
    }
  }

  // Process remaining tokens if any exist after the initial formatting
  while (messageTokens.length > 0) {
    const token = messageTokens.shift()
    let messageContent = ''
    if (token instanceof Error) {
      messageContent = token.toString()
    } else if (typeof token === 'object' && token !== null) {
      messageContent = util.inspect(token, { colors: true, depth: null })
    } else {
      messageContent = token ? token.toString() : ''
    }
    formattedMessage += ' ' + messageContent
  }

  const styledMessage =
    type && renderer.style[type]
      ? renderer.style[type](formattedMessage)
      : formattedMessage

  let fullPrefix = ''
  let outputPrefix = ''
  if (prefix) {
    fullPrefix = prefixColor ? prefixColor(prefix) : renderer.style.info(prefix)
    outputPrefix = fullPrefix !== '' ? `${fullPrefix} ` : ''
  }
  if (type === 'success') {
    fullPrefix +=
      (fullPrefix ? ' ' : '') +
      (prefixColor != null ? prefixColor('✔') : renderer.colors.red('✔'))
    outputPrefix = fullPrefix !== '' ? `${fullPrefix} ` : ''
  }
  if (type === 'debug') {
    fullPrefix = prefix ? colorizeString(prefix) : fullPrefix
    outputPrefix = fullPrefix !== '' ? `${fullPrefix} ` : ''
  }
  if (type === 'error') {
    fullPrefix += (fullPrefix ? ' ' : '') + renderer.style.error('✖')
    outputPrefix = fullPrefix !== '' ? `${fullPrefix} ` : ''
  }
  if (type === 'warning') {
    fullPrefix += (fullPrefix ? ' ' : '') + renderer.colors.red('[!]')
    outputPrefix = fullPrefix !== '' ? `${fullPrefix} ` : ''
  }

  // Write the log to stderr
  let fullMessage = `${outputPrefix}${styledMessage}`

  if (!disableNewLine) {
    fullMessage = `${fullMessage}\n`
  }

  process.stderr.write(fullMessage)

  // Save last token
  renderer.state.lastToken = fullMessage

  // Restart the spinner if it was stopped

  const startOptions = {}

  if (level === 'compose') {
    startOptions.isComposeMessage = true
  }

  renderer.spinner.start(startOptions)
}

/**
 * Handles writing progress to the console.
 * If there are multiple progress states,
 * updates the renderer.spinner text with the number of states,
 * otherwise updates the renderer.spinner text with the progress state value.
 * If there are no progress states, stops the renderer.spinner.
 */
const writeProgress = ({ namespace = null, isComposeMessage } = {}) => {
  /**
   * It's common for progress states to be created,
   * but have no messages. So, we only want to count progress states
   * that have messages to determine if we should stop the spinner,
   * or what it should display.
   */
  const progressStates = Array.from(renderer.state.progressTasks.values())
  const progressStatesWithMessages = progressStates.filter(
    (progressState) => progressState.message,
  )

  // If no progress states with messages exist, stop/destroy the renderer.spinner
  if (!isComposeMessage && progressStatesWithMessages.length === 0) {
    renderer.spinner.stop()
    renderer.spinner._spinner = null
    return
  }

  // If progress states with messages exist, handle display
  let content
  if (progressStatesWithMessages.length > 1) {
    // If there are multiple progress states, update the renderer.spinner text
    const additionalTaskCount = progressStatesWithMessages.length - 1
    content = `${
      progressStatesWithMessages[0].message
    } (and ${additionalTaskCount} more ${
      additionalTaskCount < 2 ? 'task' : 'tasks'
    })`
  } else if (progressStatesWithMessages.length === 1) {
    // If there is only one progress state, update the renderer.spinner text with its value
    content = progressStatesWithMessages[0].message
  }

  // If renderer is set to debug mode and there are progress states, log the progress states
  if (renderer.logLevel === 'debug') {
    // Use the existing prefix if set, otherwise default to the namespacePrefix
    writeStdErr({
      level: 'debug',
      type: 'debug',
      messageTokens: [content],
      prefix: `${namespace || 'unknown'}:`,
    })
    return
  }

  if (!renderer.spinner.isInitialized()) {
    renderer.spinner.start({ content, isComposeMessage })
  } else {
    renderer.spinner.update({ content, isComposeMessage })
  }
}

/**
 * Handles writing text to the console.
 */
const writeText = (...textTokens) => {
  // Stop the spinner to not collide with log output
  renderer.spinner.stop()

  const text = joinTextTokens(textTokens)
  process.stdout.write(joinTextTokens(text))

  renderer.state.lastToken = text

  // Restart the spinner if it was stopped
  renderer.spinner.start({ lineBreak: false })
}

/**
 * Join text tokens for the writeText method, ensuring correct array handling and joining.
 * This function ensures that it can handle both array and non-array inputs gracefully.
 */
const joinTextTokens = (textTokens) => {
  // Function to deeply flatten an array
  const flattenDeep = (array) => {
    // Make sure the input is actually an array; otherwise, wrap it in one
    if (!Array.isArray(array)) return [array]

    return array.reduce(
      (acc, val) =>
        Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val),
      [],
    )
  }

  // Make sure the initial input is treated as an array if it is not
  const flattened = flattenDeep(
    Array.isArray(textTokens) ? textTokens : [textTokens],
  )

  // Filter out non-string elements and join the remaining strings with newlines
  const finalText = flattened
    .filter((textToken) => typeof textToken === 'string')
    .join('\n')

  // If the final text does not end with a new line, add one for separation
  if (!finalText.endsWith('\n')) {
    return finalText + '\n'
  }

  return finalText
}

/**
 * Handles progress state and write operations
 */
class Progress {
  constructor({ namespace = null } = {}) {
    this.namespace = namespace
    // If it doesn't start with "s:", add it
    if (!this.namespace.startsWith('s:')) {
      this.namespace = `s:${this.namespace}`
    }
    this.message = null
  }

  /**
   * Find or create a Progress instance.
   */
  static get(namespace) {
    const formattedNamespace = namespace.startsWith('s:')
      ? namespace
      : `s:${namespace}`
    if (!renderer.state.progressTasks.has(formattedNamespace)) {
      renderer.state.progressTasks.set(
        formattedNamespace,
        new Progress({ namespace: formattedNamespace }),
      )
    }
    return renderer.state.progressTasks.get(formattedNamespace)
  }

  /**
   * Though you cannot create children of progress instances,
   * this method is provided for consistency with the Logger class,
   * but it returns a peer progress instance instead of a child.
   */
  get(namespace) {
    return Progress.get(namespace)
  }

  /**
   * Updates the progress state with a new message.
   */
  notice(message, { isComposeMessage = false } = {}) {
    if (!renderer.isInteractive) {
      writeStdErr({ level: 'info', messageTokens: [message] })
      return
    }
    if (renderer.state.progressTasks.has(this.namespace) === undefined) {
      throw new Error(
        `Progress state with name ${this.namespace} does not exist.`,
      )
    }
    this.message = message
    writeProgress({ namespace: this.namespace, isComposeMessage })
  }

  /**
   * Removes the progress state and the namespace from the renderer instance.
   * Stops the renderer.spinner if there are no progress states.
   */
  remove() {
    if (!renderer.isInteractive || renderer.logLevel === 'compose') {
      return
    }
    if (renderer.state.progressTasks.has(this.namespace) === undefined) {
      return
    }
    this.message = null
    writeProgress()
  }

  /**
   * Copy and return the current progress state.
   * This is useful for saving and restoring the progress state externally.
   * For example, you may want to save the message, alter it, and then restore it.
   */
  getState() {
    if (!renderer.isInteractive) {
      return
    }
    if (renderer.state.progressTasks.has(this.namespace) === undefined) {
      return
    }
    return { ...renderer.state.progressTasks.get(this.namespace) }
  }

  /**
   * Below are deprecated methods kept for backward compatibility.
   */

  /**
   * Backware Compatibility Support
   * This is not needed due to simply using .get() and .notice() instead.
   * It's provided here for backward compatibility.
   * The "name" parameter is defunct and does nothing.
   * Otherwise the 'notice()' method is called
   * DO NOT USE THIS METHOD. Use the methods above instead.
   */
  create({ name, message } = {}) {
    this.notice(message)
    return this
  }

  update(message) {
    this.notice(message)
  }

  info(message) {
    this.notice(message)
  }
}

/**
 * The main interface for dependencies to use for
 * writing logs, progress and more.
 */
class Logger {
  constructor({ namespace = null, prefix = null, prefixColor = null } = {}) {
    // Validate namespace exists
    if (namespace != null && typeof namespace !== 'string') {
      throw new Error('Logger requires a "namespace" and it must be a string.')
    }
    // Sanitize the namespace. Lowercase, remove whitespace, and replace spaces with hyphens
    namespace = namespace
      ? namespace
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-:]/g, '')
      : null
    // Validate namespace exists, is a string, is not empty, and meets this regex (/^[a-z0-9-:]+$/)
    if (
      namespace != null &&
      (typeof namespace !== 'string' || !/^[a-z0-9-:]+$/.test(namespace))
    ) {
      throw new Error(
        `Logger namespace of ${namespace} is invalid. A namespace is required, must be a string, and can only contain lowercase letters, numbers, hyphens, or colons.`,
      )
    }

    this.namespace = namespace
    this.prefix = prefix
    this.prefixColor = prefixColor
  }

  /**
   * Find or create a child namespace on this renderer instance.
   */
  get(newNamespace) {
    // Get the child namespace
    newNamespace = `${this.namespace}:${newNamespace}`
    // Check if the full namespace already exists
    if (!renderer.state.namespaces.has(newNamespace)) {
      // If not, create a new renderer instance with the given full namespace
      renderer.state.namespaces.set(
        newNamespace,
        new Logger({
          namespace: newNamespace,
        }),
      )
    }
    // Return the renderer instance from the global registry
    return renderer.state.namespaces.get(newNamespace)
  }

  /**
   * Detect whether the Logger is running in an interactive environment.
   */
  isInteractive() {
    return !!renderer.isInteractive
  }

  /**
   * Methods for writing logs to the console at different levels.
   */
  error(...messageTokens) {
    writeStdErr({
      level: 'error',
      type: 'error',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  warning(...messageTokens) {
    writeStdErr({
      level: 'warning',
      type: 'warning',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  notice(...messageTokens) {
    writeStdErr({
      level: 'notice',
      type: 'notice',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  write(...messageTokens) {
    writeStdErr({
      level: 'notice',
      type: 'notice',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
      disableNewLine: renderer.isInteractive ? true : false,
    })
  }

  writeCompose(...messageTokens) {
    writeStdErr({
      level: 'compose',
      type: 'compose',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
      disableNewLine: renderer.isInteractive ? true : false,
    })
  }

  info(...messageTokens) {
    writeStdErr({
      level: 'info',
      type: 'info',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  debug(...messageTokens) {
    // Use the existing prefix if set, otherwise default to the namespacePrefix
    writeStdErr({
      level: 'debug',
      type: 'debug',
      messageTokens: [...messageTokens],
      prefix: `${this.namespace || 'unknown'}:`,
    })
  }

  // New Methods - Title should probably be a style
  aside(...messageTokens) {
    writeStdErr({
      level: 'notice',
      type: 'aside',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  title(...messageTokens) {
    writeStdErr({
      level: 'notice',
      type: 'title',
      messageTokens: [...messageTokens],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  success(message) {
    writeStdErr({
      level: 'notice',
      type: 'success',
      messageTokens: [message],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
    })
  }

  /**
   * Writes an empty line to the console in a way that is
   * safe and doesn't break spinners, etc. DO NOT USE console.log()
   */
  blankLine() {
    writeStdErr({ level: 'notice', messageTokens: [''] })
  }

  /**
   * Renders a confirmation prompt to the console.
   * @param {Object} param - The parameters for the confirmation prompt.
   * @param {string} param.message - The message to display for the confirmation prompt.
   * @param {boolean} param.initial - The initial value for the confirmation prompt.
   * @returns {Promise<boolean>} - The user's confirmation response.
   */
  async confirm({ message, initial }) {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const enquirer = new Enquirer()

    const response = await enquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      initial: initial ?? true,
      message: renderer.colors.default(message),
      // prefix: '',
      styles: {
        primary: renderer.colors.red,
        submitted: renderer.colors.red,
        success: renderer.colors.red,
      },
      onCancel: () => {
        const err = new Error('Canceled')
        err.stack = undefined
        throw err
      },
    })

    // Save the last selected value
    renderer.state.lastToken = response.confirm

    // Restart the spinner if it was stopped
    renderer.spinner.start()

    return response.confirm
  }

  /**
   * Renders a single input prompt to the console.
   * @param {Object} param - The parameters for the input prompt.
   * @param {string} param.message - The message to display for the input prompt.
   * @returns {Promise<string>} - The user's input.
   */
  async input({ message, validate, inputType = 'input', initial }) {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const enquirer = new Enquirer()

    const response = await enquirer.prompt({
      type: inputType,
      name: 'input',
      message: renderer.colors.default(message),
      initial,
      // @ts-expect-error ...
      styles: {
        danger: renderer.colors.red, // This sets the color for the error message
        primary: renderer.colors.red, // This sets the primary color to red
        submitted: renderer.colors.red, // Assuming 'submitted' is the correct property for the final input
      },
      validate: (input) => {
        let res
        if (validate) {
          res = validate(input)
          if (res === true) {
            return res
          }
          res = renderer.colors.red(res)
        } else {
          res = true
        }
        return res
      },
      onCancel: () => {
        const err = new Error('Canceled')
        err.stack = undefined
        throw err
      },
    })

    // Save the last selected value
    renderer.state.lastToken = response.input

    // Restart the spinner if it was stopped
    renderer.spinner.start()

    return response.input
  }

  /**
   * Renders a select prompt to the console.
   * @param param.message string
   * @param param.choices any[]
   * @returns
   */
  async choose({ message, choices, onCancel }) {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const enquirer = new Enquirer()

    // Mapping names to values for result processing
    const nameToValueMap = choices.reduce((map, choice) => {
      map[choice.name] = choice.value
      return map
    }, {})

    const answer = await enquirer.prompt({
      type: 'select',
      name: 'select',
      choices: choices.map((choice) => choice.name),
      message: renderer.colors.default(message),
      styles: {
        danger: renderer.colors.red, // This sets the color for the error message
        primary: renderer.colors.red, // This sets the primary color to red
        submitted: renderer.colors.red, // Assuming 'submitted' is the correct property for the final input
      },
      result(name) {
        // Return the value corresponding to the selected name
        return nameToValueMap[name]
      },
      onCancel: () => {
        if (onCancel) {
          return onCancel()
        }
        const err = new Error('Canceled')
        err.stack = undefined
        throw err
      },
    })

    // Save the last selected value
    renderer.state.lastToken = answer.select

    // Restart the spinner if it was stopped
    renderer.spinner.start()

    return answer.select
  }

  async checkbox({ message, choices, initial }) {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const enquirer = new Enquirer()

    const answer = await enquirer.prompt({
      type: 'multiselect',
      name: 'multiselect',
      choices,
      initial,
      message: renderer.colors.default(message),
      styles: {
        danger: renderer.colors.red, // This sets the color for the error message
        primary: renderer.colors.red, // This sets the primary color to red
        submitted: renderer.colors.red, // Assuming 'submitted' is the correct property for the final input
      },
      result: (names) => {
        return choices
          .filter((choice) => names.includes(choice.name))
          .map((choice) => choice.value)
      },
      onCancel: () => {
        const err = new Error('Canceled')
        err.stack = undefined
        throw err
      },
    })
    // Save the last selected value
    renderer.state.lastToken = answer.multiselect

    // Restart the spinner if it was stopped
    renderer.spinner.start()

    return answer.multiselect
  }

  /**
   * Renders a logo to the console.
   * @param type string | 'serverless-framework'
   */
  logo({ postfix = '' } = {}) {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const content = renderer.style.bold(
      `${renderer.style.title('Serverless ')}${renderer.colors.red(
        'ϟ',
      )}${renderer.style.title(` Framework${postfix ? ` ${postfix}` : ''}`)}`,
    )
    writeStdErr({
      level: 'notice',
      messageTokens: [content],
    })

    // Restart the spinner if it was stopped
    renderer.spinner.start()
  }

  /**
   * Renders the support logo to the console.
   */
  logoSupport() {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const content = renderer.style.bold(
      `${renderer.style.title('Serverless ')}${renderer.colors.red(
        'ϟ',
      )}${renderer.style.title(' Support')}`,
    )

    writeStdErr({
      level: 'notice',
      messageTokens: [content],
    })

    // Restart the spinner if it was stopped
    renderer.spinner.start()
  }

  /**
   * Renders the dev mode logo to the console.
   */
  logoDevMode() {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const content = renderer.style.bold(
      `${renderer.style.title('Dev ')}${renderer.colors.red(
        'ϟ',
      )}${renderer.style.title(' Mode')}`,
    )
    writeStdErr({
      level: 'notice',
      messageTokens: [content],
    })

    // Restart the spinner if it was stopped
    renderer.spinner.start()
  }

  /**
   * Renders the Serverless Compose logo to the console.
   */
  logoCompose() {
    let content = renderer.style.bold(
      `${renderer.style.title('Serverless ')}${renderer.colors.red(
        'ϟ',
      )}${renderer.style.title(' Compose')}
`,
    )

    const disableNewLine = renderer.isInteractive ? true : false

    writeStdErr({
      level: 'compose',
      type: 'compose',
      messageTokens: [content],
      prefix: this.prefix,
      prefixColor: this.prefixColor,
      disableNewLine,
    })
  }

  /**
   * Renders the Serverless Compose logo to the console.
   */
  logoServerlessContainerFramework() {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    const content = renderer.style.bold(
      `${renderer.style.title('Serverless ')}${renderer.colors.red(
        'ϟ',
      )}${renderer.style.title(' Container Framework')}`,
    )
    writeStdErr({
      level: 'notice',
      messageTokens: [content],
    })

    // Restart the spinner if it was stopped
    renderer.spinner.start()
  }

  /**
   * Renders the Serverless AI Framework logo to the console.
   */
  logoServerlessAiFramework(devMode = false) {
    // Stop the spinner to not collide with prompt
    renderer.spinner.stop()

    let content

    if (devMode) {
      content = renderer.style.bold(
        `${renderer.style.title('Serverless AI Framework ')}${renderer.colors.red(
          'ϟ',
        )}${renderer.style.title(' Dev Mode')}`,
      )
    } else {
      content = renderer.style.bold(
        `${renderer.style.title('Serverless ')}${renderer.colors.red(
          'ϟ',
        )}${renderer.style.title(' AI Framework')}`,
      )
    }

    writeStdErr({
      level: 'notice',
      messageTokens: [content],
    })

    renderer.spinner.start()
  }

  /**
   * Backward Compatibility Support
   * These methods are necessary to support backward compatibility.
   * DO NOT USE THESE METHODS. Use the methods above instead.
   */
  // Alias for notice()
  logNotice(...args) {
    this.notice(...args)
  }

  // Alias for notice()
  log(...args) {
    this.notice(...args)
  }

  // Alias for notice()
  consoleLog(...args) {
    this.notice(...args)
  }

  // Alias for error()
  logError(...args) {
    this.error(...args)
  }

  // Alias for warning()
  logWarning(...args) {
    this.warning(...args)
  }

  // Alias for info()
  logInfo(...args) {
    this.info(...args)
  }

  // Alias for info()
  verbose(...args) {
    this.info(...args)
  }

  // Alias for debug()
  logDebug(...args) {
    this.debug(...args)
  }
}

/**
 * This is a cache for plugin-specific loggers.
 */
const pluginWritersCache = new Map()

/**
 * Create a default logger instance with the namespace "s".
 * This is the default logger instance that should be used
 * for all logging in the Serverless Framework. All other
 * loggers will be created as children of this logger.
 */
renderer.state.namespaces.set('s', new Logger({ namespace: 's' }))
const log = renderer.state.namespaces.get('s')

/**
 * Since progress instances are linked to spinners,
 * we don't want to have a default progress instance.
 * Instead, we provide a factory function to create progress instances.
 */
const progress = {
  /**
   * Find or create a Progress instance.
   */
  get(namespace) {
    return Progress.get(namespace)
  },
  /**
   * Remove all progress states.
   * Useful for cleaning up progress states after a process is complete,
   * or an error occurs.
   */
  cleanup() {
    renderer.state.progressTasks.clear()
    writeProgress()
  },
}

/**
 * Make a copy of the style object for external use
 */
const style = { ...renderer.style }

/**
 * Get Plugin Writers
 * This function is used to get the plugin-specific loggers.
 * It creates a logger instance for the plugin and returns it.
 * If the logger instance already exists, it returns the cached instance.
 * @param pluginName string
 * @returns
 */
const getPluginWriters = (pluginName) => {
  // Validate plugin name
  if (typeof pluginName !== 'string') {
    throw new Error('pluginName must be a string')
  }

  // Normalize and validate pluginName
  pluginName = pluginName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  // Check cache
  if (pluginWritersCache.has(pluginName)) {
    return pluginWritersCache.get(pluginName)
  }

  const logger = log.get(`sls:plugin:${pluginName}`)

  const logFunc = function (...args) {
    return logger.log(...args)
  }

  Object.getOwnPropertyNames(Logger.prototype).forEach((method) => {
    if (method !== 'constructor') {
      logFunc[method] = logger[method].bind(logger)
    }
  })

  // Create instances for plugin
  const pluginWriter = {
    log: logFunc,
    // Note that plugins simply get a copy of "main" progress
    progress: progress.get('main'),
    style,
    writeText,
  }

  // Cache and return
  pluginWritersCache.set(pluginName, pluginWriter)
  return pluginWriter
}

// Exports (adjusted to CommonJS syntax)
export {
  Logger,
  getGlobalRendererSettings,
  setGlobalRendererSettings,
  log,
  progress,
  writeText,
  style,
  stringToSafeColor,
  getPluginWriters,
  colorizeString,
}
