'use strict';

const _ = require('lodash');
const { distance: getDistance } = require('fastest-levenshtein');

const getCollectCommandWords = (commandObject, commandWordsArray) => {
  let wordsArray =
    Array.isArray(commandWordsArray) && commandWordsArray.length ? commandWordsArray : [];
  Object.entries(commandObject).forEach(([commandChildName, commandChildObject]) => {
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
  commandWordsArray.forEach((correctCommand) => {
    const distance = getDistance(inputCommand, correctCommand);
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
