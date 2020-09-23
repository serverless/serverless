'use strict';

const inquirer = require('@serverless/utils/inquirer');

module.exports = {
  confirm: (message, options = {}) => {
    const name = options.name || 'isConfirmed';
    return inquirer
      .prompt({
        message,
        type: 'confirm',
        name,
      })
      .then(result => result[name]);
  },
};
