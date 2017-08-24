'use strict';

/* Clear terminal output */
const clearConsole = function () {
  process.stdout.write(process.platform !== 'win32' ? '\x1B[2J\x1B[3J\x1B[H' : '\x1Bc');
};

module.exports = clearConsole;
