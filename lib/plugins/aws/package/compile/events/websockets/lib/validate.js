'use strict';

const _ = require('lodash');

module.exports = {
  validate() {
    const events = [];

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, (event) => {
        // check if we have both, `http` and `websocket` events which is not supported
        if (_.has(event, 'websocket') && _.has(event, 'http')) {
          const errorMessage = 'The event type can either be "http" or "websocket" but not both.';
          throw new this.serverless.classes.Error(errorMessage);
        }
        if (_.has(event, 'websocket')) {
          // dealing with the extended object definition
          if (_.isObject(event.websocket)) {
            if (!event.websocket.route) {
              const errorMessage = 'You need to set the "route" when using the websocket event.';
              throw new this.serverless.classes.Error(errorMessage);
            }
            events.push({
              functionName,
              route: event.websocket.route,
            });
          // dealing with the simplified string representation
          } else if (_.isString(event.websocket)) {
            events.push({
              functionName,
              route: event.websocket,
            });
          }
        }
      });
    });

    return {
      events,
    };
  },
};
