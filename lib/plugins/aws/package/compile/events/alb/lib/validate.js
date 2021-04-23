'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../../../serverless-error');

module.exports = {
  // see https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html#arn-syntax-elb-application
  ALB_LISTENER_REGEXP: new RegExp(
    '^arn:aws[\\w-]*:elasticloadbalancing:.+:listener\\/app\\/[\\w-]+\\/([\\w-]+)\\/([\\w-]+)$'
  ),

  validate() {
    const authorizers = {};
    const albAuthConfig = this.serverless.service.provider.alb;
    if (albAuthConfig && albAuthConfig.authorizers) {
      for (const [name, auth] of Object.entries(albAuthConfig.authorizers)) {
        authorizers[name] = this.validateAlbAuth(auth);
      }
    }

    const events = [];

    Object.entries(this.serverless.service.functions).forEach(([functionName, functionObject]) => {
      functionObject.events.forEach((event) => {
        if (event.alb) {
          if (_.isObject(event.alb)) {
            const { albId, listenerId } = this.validateListenerArn(
              event.alb.listenerArn,
              functionName
            );
            const albObj = {
              // This is set to the ALB ID if the listener ARNs are provided as strings,
              // or the listener logical ID if listenerARNs are given as refs
              albId,
              listenerId,
              listenerArn: event.alb.listenerArn,
              priority: event.alb.priority,
              conditions: {},
              // the following is data which is not defined on the event-level
              functionName,
            };

            if (event.alb.conditions.path) {
              albObj.conditions.path = [].concat(event.alb.conditions.path);
            }
            if (event.alb.conditions.host) {
              albObj.conditions.host = [].concat(event.alb.conditions.host);
            }
            if (event.alb.conditions.method) {
              albObj.conditions.method = [].concat(event.alb.conditions.method);
            }
            if (event.alb.conditions.header) {
              albObj.conditions.header = event.alb.conditions.header;
            }
            if (event.alb.conditions.query) {
              albObj.conditions.query = event.alb.conditions.query;
            }
            if (event.alb.conditions.ip) {
              albObj.conditions.ip = [].concat(event.alb.conditions.ip);
            }
            this.validateConditions(event.alb.conditions, functionName);

            if (event.alb.multiValueHeaders) {
              albObj.multiValueHeaders = event.alb.multiValueHeaders;
            }
            if (event.alb.targetGroupName) {
              if (this.provider.getAlbTargetGroupPrefix()) {
                throw new ServerlessError(
                  'ALB "targetGroupName" setting is exclusive with "provider.alb.targetGroupPrefix": Please specify only one.',
                  'ALB_TARGET_GROUP_NAME_EXCLUSIVE'
                );
              }
              albObj.targetGroupName = event.alb.targetGroupName;
            }

            if (event.alb.authorizer) {
              albObj.authorizers = this.validateEventAuthorizers(event, authorizers, functionName);
            }
            if (event.alb.healthCheck) {
              albObj.healthCheck = this.validateAlbHealthCheck(event);
            }
            events.push(albObj);
          }
        }
      });
    });
    this.validatePriorities(events);

    return {
      events,
      authorizers,
    };
  },

  validateConditions(conditions, functionName) {
    // At least one condition must be set
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-elasticloadbalancingv2-listenerrule.html#cfn-elasticloadbalancingv2-listenerrule-conditions

    if (Object.keys(conditions).length > 0) {
      return;
    }

    throw new ServerlessError(
      `Cannot setup "alb" event in "${functionName}" function: At least one condition must be defined`,
      'ALB_NO_CONDITIONS'
    );
  },

  validateListenerArn(listenerArn, functionName) {
    // If the ARN is a ref, use the logical ID instead of the ALB ID
    if (_.isObject(listenerArn)) {
      if (listenerArn.Ref) {
        return { albId: listenerArn.Ref, listenerId: listenerArn.Ref };
      }
    }
    const matches = listenerArn.match(this.ALB_LISTENER_REGEXP);
    if (!matches) {
      throw new ServerlessError(
        `Invalid ALB listenerArn in function "${functionName}".`,
        'ALB_INVALID_LISTENER_ARN'
      );
    }
    return { albId: matches[1], listenerId: matches[2] };
  },

  validatePriorities(albEvents) {
    let comparator;
    let duplicates;
    const samePriority = (e1, e2) => e1.priority === e2.priority;
    const sameFunction = (e1, e2) => e1.functionName === e2.functionName;
    const sameListener = (e1, e2) => e1.listenerId === e2.listenerId;

    // For this special case, we need to let the user know
    // it is a Serverless limitation (but not an ALB limitation)
    comparator = (e1, e2) => samePriority(e1, e2) && !sameListener(e1, e2) && sameFunction(e1, e2);
    duplicates = _.difference(albEvents, _.uniqWith(albEvents, comparator));
    if (duplicates.length > 0) {
      const errorMessage = [
        `ALB event in function "${duplicates[0].functionName}"`,
        ` cannot use priority "${duplicates[0].priority}" because it is already in use.\n`,
        '  Events in the same function cannot use the same priority even if they have a different listenerArn.\n',
        '  This is a Serverless limitation that will be fixed in the next major release.',
      ].join('');
      throw new ServerlessError(errorMessage, 'ALB_PRIORITY_ALREADY_IN_USE');
    }

    comparator = (e1, e2) => samePriority(e1, e2) && sameListener(e1, e2) && !sameFunction(e1, e2);
    duplicates = _.difference(albEvents, _.uniqWith(albEvents, comparator));
    if (duplicates.length > 0) {
      const errorMessage = [
        `ALB event in function "${duplicates[0].functionName}"`,
        ` cannot use priority "${duplicates[0].priority}" because it is already in use.`,
      ].join('');
      throw new ServerlessError(errorMessage, 'ALB_PRIORITY_ALREADY_IN_USE');
    }
  },

  validateEventAuthorizers(event, authorizers, functionName) {
    const eventAuthorizers = Array.isArray(event.alb.authorizer)
      ? event.alb.authorizer
      : [event.alb.authorizer];
    for (const auth of eventAuthorizers) {
      if (!authorizers[auth]) {
        throw new ServerlessError(
          `No match for "${auth}" in function "${functionName}" found in registered ALB authorizers`,
          'ALB_MISSING_AUTHORIZER'
        );
      }
    }
    return eventAuthorizers;
  },

  validateAlbAuth(auth) {
    auth.onUnauthenticatedRequest = auth.onUnauthenticatedRequest || 'deny';
    return auth;
  },

  validateAlbHealthCheck(event) {
    const eventHealthCheck = event.alb.healthCheck;
    if (_.isObject(eventHealthCheck)) {
      return Object.assign(eventHealthCheck, { enabled: true });
    }
    return { enabled: true };
  },
};
