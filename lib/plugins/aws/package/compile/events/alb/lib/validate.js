'use strict';

const _ = require('lodash');

// eslint-disable-next-line max-len
const CIDR_IPV6_PATTERN = /^s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:)))(%.+)?s*(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))$/;
const CIDR_IPV4_PATTERN = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$/;

module.exports = {
  validate() {
    const events = [];

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, event => {
        if (_.has(event, 'alb')) {
          if (_.isObject(event.alb)) {
            const albObj = {
              listenerArn: event.alb.listenerArn,
              priority: event.alb.priority,
              conditions: {
                // concat usage allows the user to provide value as a string or an array
                path: _.concat(event.alb.conditions.path),
              },
              // the following is data which is not defined on the event-level
              functionName,
            };
            if (event.alb.conditions.host) {
              albObj.conditions.host = _.concat(event.alb.conditions.host);
            }
            if (event.alb.conditions.method) {
              albObj.conditions.method = _.concat(event.alb.conditions.method);
            }
            if (event.alb.conditions.header) {
              albObj.conditions.header = this.validateHeaderCondition(event, functionName);
            }
            if (event.alb.conditions.query) {
              albObj.conditions.query = this.validateQueryCondition(event, functionName);
            }
            if (event.alb.conditions.ip) {
              albObj.conditions.ip = this.validateIpCondition(event, functionName);
            }
            events.push(albObj);
          }
        }
      });
    });

    return {
      events,
    };
  },

  validateHeaderCondition(event, functionName) {
    const messageTitle = `Invalid ALB event "header" condition in function "${functionName}".`;
    if (
      !_.isObject(event.alb.conditions.header) ||
      !event.alb.conditions.header.name ||
      !event.alb.conditions.header.values
    ) {
      const errorMessage = [
        messageTitle,
        ' You must provide an object with "name" and "values" properties.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    if (!_.isArray(event.alb.conditions.header.values)) {
      const errorMessage = [messageTitle, ' Property "values" must be an array.'].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return event.alb.conditions.header;
  },

  validateQueryCondition(event, functionName) {
    if (!_.isObject(event.alb.conditions.query)) {
      const errorMessage = [
        `Invalid ALB event "query" condition in function "${functionName}".`,
        ' You must provide an object.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return event.alb.conditions.query;
  },

  validateIpCondition(event, functionName) {
    const cidrBlocks = _.concat(event.alb.conditions.ip);
    const allValuesAreCidr = cidrBlocks.every(
      cidr => CIDR_IPV4_PATTERN.test(cidr) || CIDR_IPV6_PATTERN.test(cidr)
    );

    if (!allValuesAreCidr) {
      const errorMessage = [
        `Invalid ALB event "ip" condition in function "${functionName}".`,
        ' You must provide values in a valid IPv4 or IPv6 CIDR format.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return cidrBlocks;
  },
};
