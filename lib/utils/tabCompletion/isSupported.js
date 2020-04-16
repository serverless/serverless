'use strict';

module.exports = process.platform !== 'win32' && process.version.match(/\d+/)[0] >= 8;
