'use strict';

const { writeText, style } = require('@serverless/utils/log');

module.exports = (serviceOutputs) => {
  writeText();
  for (const [section, entries] of serviceOutputs) {
    if (typeof entries === 'string') {
      writeText(`${style.aside(`${section}:`)} ${entries}`);
    } else {
      writeText(`${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}`);
    }
  }
};
