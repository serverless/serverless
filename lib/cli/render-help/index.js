'use strict';

const resolveInput = require('../resolve-input');
const renderGeneralHelp = require('./general');
const renderCommandHelp = require('./command');

module.exports = (loadedPlugins) => {
  const { command } = resolveInput();
  if (command === 'help') {
    renderGeneralHelp(loadedPlugins);
  } else {
    renderCommandHelp(command);
  }
};
