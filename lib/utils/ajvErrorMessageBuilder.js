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
      case 'additionalProperties':
        message = `"${error.params.additionalProperty}" ${error.message} (path: ${error.dataPath})`;
        break;
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

const removeUnwantedErrorMessage = errors => {
  const chunks = [];
  for (const errorI of errors) {
    const chunkId = errorI.dataPath;
    let subChunk = [];
    for (const errorJ of errors) {
      if (errorJ.dataPath.includes(chunkId)) {
        subChunk.push({
          dataPath: errorJ.dataPath,
          message: errorJ.message,
          chunkId,
        });
      }
    }

    if (subChunk.length === 1) subChunk = null;
    subChunk = subChunk ? subChunk.filter(el => el.dataPath !== el.chunkId) : null;

    chunks.push(subChunk);
  }

  return _.flatten(chunks.filter(item => item));
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

  const friendlyMessagesWithDataPath = uniqueErrors
    .map(item => {
      const isEventParam = /^\.functions\['[\w]+'\]\.events\[[0-9]+\]\.[\w]+$/.test(item.dataPath);
      if (item.params && item.params && item.params.additionalProperty && isEventParam) {
        const eventName = item.dataPath.split('.')[3];
        return {
          dataPath: item.dataPath,
          message: `Unsupported parameter '${item.params.additionalProperty}' for '${eventName}' event`,
        };
      }

      // regex matches '.functions['xxx'].events[x]'
      const isFunctionEvent = /^\.functions\['[\w]+'\]\.events\[[0-9]+\]$/.test(item.dataPath);
      if (item.params && item.params && item.params.additionalProperty && isFunctionEvent) {
        return {
          dataPath: item.dataPath,
          message: `Unsupported function event '${item.params.additionalProperty}'`,
        };
      }

      return null;
    })
    .filter(err => err);

  let result = friendlyMessagesWithDataPath;
  if (result.length > 1) {
    result = removeUnwantedErrorMessage(friendlyMessagesWithDataPath);
  }

  return result.map(el => el.message);
};

module.exports = {
  buildErrorMessages,
  buildUserFriendlyMessages,
  removeUnwantedErrorMessage,
};
