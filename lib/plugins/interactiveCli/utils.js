'use strict';

const inquirer = require('./inquirer');

module.exports = {
  confirm: message =>
    inquirer
      .prompt({
        message,
        type: 'confirm',
        name: 'isConfirmed',
      })
      .then(({ isConfirmed }) => isConfirmed),
};
