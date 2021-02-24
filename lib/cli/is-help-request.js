'use strict';

const resolveInput = require('./resolve-input');

module.exports = () => {
  const { commands, options } = resolveInput();
  if (options.help) return true;
  if (commands[0] === 'help') return true;
  if (!commands.length && options['help-interactive']) return true;
  return false;
};
