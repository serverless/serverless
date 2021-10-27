'use strict';

const ensureNaturalNumber = require('type/natural-number/ensure');
const filesize = require('filesize');

const resolveSignificant = (size) => {
  return size >= 1000 ? resolveSignificant(Math.floor(size / 1000)) : size;
};

module.exports = (size) =>
  filesize(size, {
    round: resolveSignificant(ensureNaturalNumber(size, { name: 'size' })) >= 9 ? 0 : 1,
  });
