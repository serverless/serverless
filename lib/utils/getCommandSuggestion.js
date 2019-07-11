'use strict';
const _ = require('lodash');
const levenshtein = require('fast-levenshtein');

const getCollectCommandWords = (commandObject, commandWordsArray) => {
  let wordsArray =
    _.isArray(commandWordsArray) && !_.isEmpty(commandWordsArray) ? commandWordsArray : [];
  _.forEach(commandObject, (commandChildObject, commandChildName) => {
    wordsArray.push(commandChildName);
    if (commandChildObject.commands) {
      wordsArray = getCollectCommandWords(commandChildObject.commands, wordsArray);
    }
  });
  return _.uniq(wordsArray);
};

const getCommandSuggestion = (inputCommand, allCommandsObject) => {
  let suggestion;
  const commandWordsArray = getCollectCommandWords(allCommandsObject);
  let minValue = 0;
  _.forEach(commandWordsArray, correctCommand => {
    const distance = levenshtein.get(inputCommand, correctCommand);
    if (minValue === 0) {
      suggestion = correctCommand;
      minValue = distance;
    }

    if (minValue > distance) {
      suggestion = correctCommand;
      minValue = distance;
    }
  });
  return suggestion;
};

module.exports = getCommandSuggestion;
