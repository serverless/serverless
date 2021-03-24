'use strict';

const chalk = require('chalk');

module.exports = (commandOptions) => {
  const dotsLength = 40;

  for (const [option, optionsObject] of Object.entries(commandOptions)) {
    let optionsDots = '.'.repeat(Math.max(dotsLength - option.length, 0));

    if (optionsObject.required) {
      optionsDots = optionsDots.slice(0, optionsDots.length - 18);
    } else {
      optionsDots = optionsDots.slice(0, optionsDots.length - 7);
    }
    if (optionsObject.shortcut) {
      optionsDots = optionsDots.slice(0, optionsDots.length - 5);
    }

    const optionInfo = `    --${option}`;
    let shortcutInfo = '';
    let requiredInfo = '';
    if (optionsObject.shortcut) shortcutInfo = ` / -${optionsObject.shortcut}`;

    if (optionsObject.required) requiredInfo = ' (required)';

    const optionsUsage = optionsObject.usage ? chalk.dim(optionsDots) + optionsObject.usage : '';
    const output = `${optionInfo}${shortcutInfo}${requiredInfo} ${optionsUsage}`;

    process.stdout.write(`${chalk.yellow(output)}\n`);
  }
};
