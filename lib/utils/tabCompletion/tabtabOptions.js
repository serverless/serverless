'use strict';

module.exports = ['serverless', 'sls'].map((name) => ({ name, completer: name }));
