'use strict';

const { writeText, style } = require('@serverlessinc/core-utils')

module.exports = (serviceOutputs) => {
  for (const [section, entries] of serviceOutputs) {
    if (typeof entries === 'string') {
      writeText(`${style.aside(`${section}:`)} ${entries}`);
    } else {
      writeText(`${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}`);
    }
  }
};
