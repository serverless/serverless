/* eslint no-console: 0 */

// Created to workaround a limitation of tabtab package:
// https://github.com/mklabs/tabtab/issues/51

'use strict';

module.exports = callback => {
  const original = console.log;
  console.log = () => {};
  const restore = () => (console.log = original);
  let result;
  try {
    result = callback();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.then(
      resolution => {
        restore();
        return resolution;
      },
      error => {
        restore();
        throw error;
      }
    );
  }
  restore();
  return result;
};
