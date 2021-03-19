'use strict';

module.exports.withError = () => new Error('failed');

module.exports.withMessage = () => new Error('failed');

module.exports.returnsError = () => new Error('failed');
