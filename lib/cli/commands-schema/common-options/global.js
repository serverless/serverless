'use strict';

module.exports = {
  help: { usage: 'Show this message', shortcut: 'h', type: 'boolean' },
  version: { usage: 'Show version info', type: 'boolean' },
};

for (const optionSchema of Object.values(module.exports)) {
  if (!optionSchema.type) optionSchema.type = 'string';
}
