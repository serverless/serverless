'use strict';

/*
 * For error object structure, see https://github.com/epoberezkin/ajv#error-objects
 */
const buildErrorMessages = errors => {
  errors = addUserFriendlyMessage(errors);
  errors = errors.sort((a, b) => b.dataPath.length - a.dataPath.length);
  if (errors.length) {
    const result = errors[0];
    return result.friendlyMessage
      ? [result.friendlyMessage]
      : [`Error: ${result.dataPath} ${result.message}`];
  }
  return [];
};

const addUserFriendlyMessage = errors => {
  return errors.map(error => {
    let friendlyMessage;

    // regex matches '.functions['xxx'].events[x].xxx'
    const isEventParam = /^\.functions\['[\w-_]+'\]\.events\[[0-9]+\]\.[\w]+$/.test(error.dataPath);
    if (error.params && error.params.additionalProperty && isEventParam) {
      const eventName = error.dataPath.split('.')[3];
      friendlyMessage = `Unsupported parameter '${error.params.additionalProperty}' for '${eventName}' event`;
    }

    // regex matches '.functions['xxx'].events[x]'
    const isFunctionEvent = /^\.functions\['[\w-_]+'\]\.events\[[0-9]+\]$/.test(error.dataPath);
    if (error.params && error.params && error.params.additionalProperty && isFunctionEvent) {
      friendlyMessage = `Unsupported function event '${error.params.additionalProperty}'`;
    }
    if (friendlyMessage) {
      error.friendlyMessage = friendlyMessage;
    }

    return error;
  });
};

module.exports = {
  buildErrorMessages,
  addUserFriendlyMessage,
};
