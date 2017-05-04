/**
 * Promisified FSE
 */
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));

module.exports = fse;
