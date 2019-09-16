'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const inquirer = require('../inquirer');

module.exports = config =>
  sinon.stub(inquirer, 'prompt').callsFake(promptConfig => {
    return BbPromise.try(() => {
      const questions = config[promptConfig.type || 'input'];
      if (!questions) throw new Error('Unexpected config type');
      const answer = questions[promptConfig.name];
      if (answer == null) throw new Error('Unexpected config name');
      return BbPromise.try(() => {
        if (promptConfig.type !== 'input') return true;
        if (!promptConfig.validate) return true;
        return promptConfig.validate(answer);
      }).then(validationResult => {
        if (validationResult !== true) {
          throw Object.assign(new Error(validationResult), { code: 'INVALID_ANSWER' });
        }
        return { [promptConfig.name]: answer };
      });
    });
  });
