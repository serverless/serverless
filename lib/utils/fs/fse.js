/**
 * Promisified FSE
 */
'use strict';

const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));

module.exports = fse;
