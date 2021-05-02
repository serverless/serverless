'use strict';

const resolveInput = require('../resolve-input');
const renderInteractiveSetupHelp = require('./interactive-setup');
const renderGeneralHelp = require('./general');
const renderCommandHelp = require('./command');

module.exports = (loadedPlugins) => {
  const { command, options } = resolveInput();
  if (!command) {
    if (options['help-interactive']) {
      renderInteractiveSetupHelp();
      return;
    }
    renderGeneralHelp(loadedPlugins);
  } else if (command === 'help') {
    renderGeneralHelp(loadedPlugins);
  } else {
    renderCommandHelp(command);
  }
};
