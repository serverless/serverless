'use strict';

const memoizee = require('memoizee');

module.exports = memoizee(
  (dataPath) => {
    let index;
    let size = 0;
    let mode = 'literal';
    let char;
    for (index = 0; (char = dataPath[index]); ++index) {
      switch (mode) {
        case 'literal':
          if (char === '.') {
            ++size;
          } else if (char === '[') {
            ++size;
            mode = 'openBracket';
          }
          break;
        case 'openBracket':
          mode = char === "'" ? 'string' : 'number';
          break;
        case 'string':
          if (char === "'") mode = 'stringQuote';
          break;
        case 'stringQuote':
          if (char === ']') mode = 'literal';
          else if (char !== "'") mode = 'string';
          break;
        case 'number':
          if (char === ']') mode = 'literal';
          break;
        default:
          throw new Error(`Unexpected mode ${mode}`);
      }
    }
    return size;
  },
  { primitive: true }
);
