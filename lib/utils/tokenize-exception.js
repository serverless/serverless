'use strict';

const { inspect } = require('util');
const isError = require('type/error/is');

const userErrorNames = new Set(['ServerlessError']);

module.exports = (exception) => {
  if (isError(exception)) {
    return {
      title: exception.name.replace(/([A-Z])/g, ' $1').trim(),
      name: exception.name,
      stack: exception.stack,
      message: exception.message,
      isUserError: userErrorNames.has(exception.name),
      code: exception.code,
      decoratedMessage: exception.decoratedMessage,
    };
  }
  return {
    title: 'Exception',
    message: inspect(exception),
    isUserError: false,
  };
};
