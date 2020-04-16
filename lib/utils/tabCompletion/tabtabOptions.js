'use strict';

module.exports = ['serverless', 'sls', 'slss'].map(name => ({ name, completer: name }));
