'use strict';
const _ = require('lodash');

/*
 * For error object structure, see https://github.com/epoberezkin/ajv#error-objects
 */
const buildErrorMessages = errors => {
  const userFriendlyMessages = buildUserFriendlyMessages(errors);
  if (userFriendlyMessages.length > 0) return userFriendlyMessages;

  const result = [];
  for (const error of errors) {
    let message = '';
    const defaultMessage = `Error: ${error.dataPath} ${error.message}`;
    switch (error.params.keyword) {
      case 'anyOf':
        if (errors.filter(err => err.keyword !== 'anyOf').length) {
          break;
        } else {
          message = defaultMessage;
          break;
        }
      // todo: add other cases as we run into them
      default:
        message = defaultMessage;
        break;
    }
    result.push(message);
  }

  return [...new Set(result.filter(v => v !== ''))];
};

const buildUserFriendlyMessages = errors => {
  const filteredErrors = errors.map(item => ({
    // removes schemaPath and adds id
    id: `${item.keyword}-${item.dataPath}`,
    keyword: item.keyword,
    dataPath: item.dataPath,
    params: item.params,
    message: item.message,
  }));

  const uniqueErrors = _.uniqBy(filteredErrors, 'id');

  let result = uniqueErrors
    .map(item => {
      // regex matches '.functions['xxx'].events[x].xxx'
      const isEventParam = /^\.functions\['[\w-_]+'\]\.events\[[0-9]+\]\.[\w]+$/.test(
        item.dataPath
      );
      if (item.params && item.params && item.params.additionalProperty && isEventParam) {
        const eventName = item.dataPath.split('.')[3];
        return `Unsupported parameter '${item.params.additionalProperty}' for '${eventName}' event`;
      }

      // regex matches '.functions['xxx'].events[x]'
      const isFunctionEvent = /^\.functions\['[\w-_]+'\]\.events\[[0-9]+\]$/.test(item.dataPath);
      if (item.params && item.params && item.params.additionalProperty && isFunctionEvent) {
        return `Unsupported function event '${item.params.additionalProperty}'`;
      }

      return null;
    })
    .filter(err => err);

  if (result.length > 1 && result.filter(m => m.startsWith('Unsupported parameter')).length) {
    result = result.filter(m => m.startsWith('Unsupported parameter'));
  }

  return result;
};

module.exports = {
  buildErrorMessages,
  buildUserFriendlyMessages,
};
