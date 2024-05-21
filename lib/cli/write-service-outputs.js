import utils from '@serverlessinc/sf-core/src/utils.js';

const { writeText, style } = utils;

/**
 * Write service outputs to the console.
 * If the output is a string, it will be written as is.
 * If the output is not a string, each item will be written on a new line.
 */
export default (serviceOutputs) => {
  for (const [section, entries] of serviceOutputs) {
    if (typeof entries === 'string') {
      writeText(`${style.aside(`${section}:`)} ${entries}`);
    } else {
      writeText(`${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}`);
    }
  }
};
