'use strict';

const _ = require('lodash');

module.exports = {
  validate() {
    const events = [];

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, (event) => {
        if (_.has(event, 'websocket')) {
          if (!event.websocket.route) {
            const errorMessage = 'You need to set the "route" when using the websocket event.';
            throw new this.serverless.classes.Error(errorMessage);
          }

          events.push({
            functionName,
            route: event.websocket.route,
          });
        }
      });
    });

    return {
      events,
    };
  },
};
