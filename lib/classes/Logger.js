'use strict';

const chalk = require('chalk');
const _ = require('lodash');

/**
 * The default mappings from our internal logger to underlying chalk methods.
 * These can be overridden on a logger instance via constructor.
 *
 * These will get exposed on the logger as `logger.INFO`, `logger.WHITE`, `logger.HEADING`, etc.
 */
const styleMapping = {
  // expose the 'no-style' style
  default: 'reset',
  // level mappings
  log: 'black',
  info: 'green',
  debug: 'magenta',
  warn: 'yellow',
  error: 'red',
  // color mappings
  black: 'black',
  red: 'red',
  green: 'green',
  yellow: 'yellow',
  blue: ' blue',
  magenta: 'magenta',
  cyan: 'cyan',
  white: 'white',
  gray: 'gray',
  grey: 'grey',
  // style mappings
  underline: 'underline',
  bold: 'bold',
  light: 'dim',
  // composite chalk styles
  heading: 'underline.bold',
};

/**
 * Apply the styles to the given message
 * @param message the message
 * @param stylePath the style path expression
 * @return {*} the styled message
 */
function applyStyle(message, stylePath) {
  // if we have a style path expression present
  if (stylePath && stylePath.length !== 0) {
    // figure out which chalk function we're calling
    const chalkFn = _.at(chalk, stylePath);

    // if we found one, use it
    if (chalkFn[0]) {
      return chalkFn[0](message);
    }
  }

  // otherwise, just return the message
  return message;
}

/**
 * Internal log method.  Will first apply any styles before logging.
 * @param message The message to log
 * @param stylePath the style path
 */
function logInternal(message, stylePath) {
  console.log(applyStyle(message, stylePath)); // eslint-disable-line no-console
}

/**
 * Convenience method that builds a logger function for a given level (info, debug, etc.)
 * @param level The log level
 * @returns {Function} the logging function
 */
function buildLogMethod(level) {
  // the log method takes a message, and any extra styles to apply (e.g., underline, dim, etc.)
  return function () {
    const message = _.head(arguments);
    const extraStyles = _.tail(arguments);
    const styleArr = [this.styles[level]];

    // if extra styles were passed in, we need to map them appropriately and add to the styleArr
    if (Array.isArray(extraStyles) && extraStyles.length > 0) {
      extraStyles.forEach((s) => {
        if (this.styles[s]) {
          styleArr.push(this.styles[s]);
        } else {
          styleArr.push(s);
        }
      });
    }

    // call internal logger fn
    logInternal(message, styleArr.join('.'));

    // return `this` for method chaining
    return this;
  };
}

/**
 * Provides console logging functionality with common styling
 */
class Logger {

  constructor(mappingOverride) {
    this.styles = {};

    // apply default style mapping, then override with passed in config (if present)
    _.defaults(this.styles, mappingOverride || {}, styleMapping);
  }

  /**
   * Get the style mapping currently in use
   * @return {{}|*}
   */
  getStyles() {
    return _.clone(this.styles);
  }

  /**
   * Convenience method to get a single style mapping
   * @param key the key
   * @return {*} the style value
   */
  getStyle(key) {
    return this.styles[key];
  }

  /**
   * Apply styles to the given message
   * @param message the message to style
   * @param styles... the styles to use (e.g., BOLD, UNDERLINE, etc.)
   * @return {String} the styled message
   */
  style() {
    const message = _.head(arguments);
    const extraStyles = _.tail(arguments);

    if (Array.isArray(extraStyles) && extraStyles.length > 0) {
      return applyStyle(message, extraStyles.join('.'));
    }

    return applyStyle(message);
  }

  /**
   * Convenience method to log a newline on the console
   */
  newline() {
    return this.log('');
  }
}

/**
 * Log message using default style
 * @type {Function}
 */
Logger.prototype.log = buildLogMethod('log');

/**
 * Log message using 'info' style
 * @type {Function}
 */
Logger.prototype.info = buildLogMethod('info');

/**
 * Log message using 'debug' style
 * @type {Function}
 */
Logger.prototype.debug = buildLogMethod('debug');

/**
 * Log message using 'warn' style
 * @type {Function}
 */
Logger.prototype.warn = buildLogMethod('warn');

/**
 * Log message using 'error' style
 * @type {Function}
 * @param {String} message The message to log
 * @param {String...} styles The extra styles to apply
 */
Logger.prototype.error = buildLogMethod('error');


// apply all style properties to the logger prototype as uppercase property names
Object.defineProperties(Logger.prototype, (() => {
  const p = {};

  // apply all style properties
  Object.keys(styleMapping).forEach((s) => {
    p[s.toUpperCase()] = {
      enumerable: true,
      get() {
        return this.styles[s];
      },
    };
  });

  return p;
})());


// export default Logger instance
module.exports = new Logger();

// export class for customizing
module.exports.Logger = Logger;
