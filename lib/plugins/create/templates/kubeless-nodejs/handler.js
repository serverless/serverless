'use strict';

module.exports = {
  capitalize(event, context) {
    return event.data ? event.data.charAt(0).toUpperCase() + event.data.slice(1).toLowerCase() : '';
  },
};
