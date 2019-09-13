'use strict';

function flatMap(f, xs) {
  return xs.reduce((accum, x) => accum.concat(f(x)), []);
}

module.exports = {
  flatMap,
};
