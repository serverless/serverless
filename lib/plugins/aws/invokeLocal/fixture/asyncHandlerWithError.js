'use strict';

module.exports.withError = () => Promise.reject(new Error('failed'));

module.exports.withMessage = () => Promise.reject('failed');

module.exports.returnsError = () => Promise.resolve(new Error('failed'));
