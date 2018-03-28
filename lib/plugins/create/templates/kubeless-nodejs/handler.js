'use strict';

const _ = require('lodash');

module.exports = {
  capitalize(event, context) {
    return _.capitalize(event.data);
  },
};
