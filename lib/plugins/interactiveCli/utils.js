'use strict';

const inquirer = require('./inquirer');

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
