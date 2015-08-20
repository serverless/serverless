'use strict';

/**
 * Ex:
 * JawsError = require('./jaws-error');
 * throw new JawsError("OOPS", JawsError.errorCodes.UNKNOWN);
 *
 * @param message
 * @param messageId
 * @constructor
 */
function JawsError(message, messageId) {
  this.name = 'JawsError';
  this.message = message;
  this.messageId = messageId;
  Error.captureStackTrace(this, JawsError);
}

JawsError.prototype = Object.create(Error.prototype);
JawsError.prototype.constructor = JawsError;

module.exports = JawsError;

module.exports.errorCodes = {
  UNKNOWN: 1,
};
