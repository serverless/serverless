'use strict';

const _ = require('lodash');

module.exports = {
  normalize() {
    const container = this.serverless.service.functions;
    _.forEach(container.functions, (functionObj, functionName) => {
      const targetFunction = container[functionName];
      _.forEach(functionObj.events, (event, index) => {
        if (typeof event.http === 'string') {
          targetFunction.events[index].http = {
            method: event.http.split(' ')[0],
            path: event.http.split(' ')[1],
          };
        }
      });
    });
  },
};
