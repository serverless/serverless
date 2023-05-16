'use strict';

module.exports = {
  help: { usage: 'Show this message', shortcut: 'h', type: 'boolean' },
  version: { usage: 'Show version info', shortcut: 'v', type: 'boolean' },
  verbose: { usage: 'Show verbose logs', type: 'boolean' },
  debug: { usage: 'Namespace of debug logs to expose (use "*" to display all)', type: 'string' },
};

for (const optionSchema of Object.values(module.exports)) {
  if (!optionSchema.type) optionSchema.type = 'string';
}
