'use strict';

module.exports.withError = () => Promise.reject(new Error('failed'));

module.exports.withMessage = () => Promise.reject('failed');
