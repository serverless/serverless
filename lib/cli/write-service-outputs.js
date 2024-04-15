import utils from '@serverlessinc/sf-core/src/utils.js';

const { writeText, style } = utils;

export default (serviceOutputs) => {
  for (const [section, entries] of serviceOutputs) {
    if (typeof entries === 'string') {
      writeText(`${style.aside(`${section}:`)} ${entries}`);
    } else {
      writeText(`${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}`);
    }
  }
};
