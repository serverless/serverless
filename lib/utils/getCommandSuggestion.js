'use strict';
const _ = require('lodash');
const BbPromise = require('bluebird');
const levenshtein = require('fast-levenshtein');

const getCollectCommandWords = (commandObject, commandWordsArray) => {
  const wordsArray = _.isArray(commandWordsArray)
    && !_.isEmpty(commandWordsArray) ? commandWordsArray : [];
  _.forEach(commandObject, (commandChildObject, commandChildName) => {
    wordsArray.push(commandChildName);
    if (commandChildObject.commands) {
      return getCollectCommandWords(commandChildObject.commands, wordsArray);
    }
    return BbPromise.resolve();
  });
  return BbPromise.resolve(_.uniq(wordsArray));
};

const getCommandSuggestion = (inputCommand, allCommandsObject) => {
  let suggestion;
  return getCollectCommandWords(allCommandsObject)
  .then(commandWordsArray => {
    let minValue = 0;
    _.forEach(commandWordsArray, correctCommand => {
      const distance = levenshtein.get(inputCommand, correctCommand);
      minValue = minValue === 0 ? distance : minValue;
      if (minValue > distance) {
        suggestion = correctCommand;
        minValue = distance;
      }
    });
    return BbPromise.resolve(suggestion);
  });
};

module.exports = getCommandSuggestion;
