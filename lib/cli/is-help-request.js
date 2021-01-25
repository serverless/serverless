'use strict';

module.exports = () => {
  const cliParams = new Set(process.argv.slice(2));
  if (cliParams.has('--help') || cliParams.has('-h')) return true;
  const firstParam = cliParams.values().next().value;
  if (firstParam === 'help') return true;
  if (cliParams.size === 1 && firstParam === '--help-interactive') return true;
  return false;
};
