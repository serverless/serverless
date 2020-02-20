'use strict';

const _ = require('lodash');

// eslint-disable-next-line max-len
const CIDR_IPV6_PATTERN = /^s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:)))(%.+)?s*(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))$/;
const CIDR_IPV4_PATTERN = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$/;
// see https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html#arn-syntax-elb-application
const ALB_LISTENER_PATTERN = /^arn:aws[\w-]*:elasticloadbalancing:.+:listener\/app\/[\w-]+\/([\w-]+)\/([\w-]+)$/;
const COGNITO_USER_POOL_PATTERN = /^arn:aws:cognito-idp:.+:userpool\/.+$/;

module.exports = {
  validate() {
    const events = [];

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, event => {
        if (_.has(event, 'alb')) {
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
            if (event.alb.multiValueHeaders) {
              albObj.multiValueHeaders = this.validateMultiValueHeadersAttribute(
                event,
                functionName
              );
            }
            if (event.alb.authenticateCognito) {
              albObj.authenticateCognito = this.validateCognitoAuth(event, functionName)
            }
            if (event.alb.authenticateOidc) {
              albObj.authenticateOidc = this.validateOidcAuth(event, functionName);
            }
            events.push(albObj);
          }
        }
      });
    });
    this.validatePriorities(events);

    return {
      events,
    };
  },

  validateListenerArn(listenerArn, functionName) {
    if (!listenerArn) {
      throw new this.serverless.classes.Error(
        `listenerArn is missing in function "${functionName}".`
      );
    }
    // If the ARN is a ref, use the logical ID instead of the ALB ID
    if (_.isObject(listenerArn)) {
      if (_.has(listenerArn, 'Ref')) {
        return { albId: listenerArn.Ref, listenerId: listenerArn.Ref };
      }
      throw new this.serverless.classes.Error(
        `Invalid ALB listenerArn in function "${functionName}".`
      );
    }
    const matches = listenerArn.match(ALB_LISTENER_PATTERN);
    if (!matches) {
      throw new this.serverless.classes.Error(
        `Invalid ALB listenerArn in function "${functionName}".`
      );
    }
    return { albId: matches[1], listenerId: matches[2] };
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
      throw new this.serverless.classes.Error(errorMessage);
    }

    comparator = (e1, e2) => samePriority(e1, e2) && sameListener(e1, e2) && !sameFunction(e1, e2);
    duplicates = _.difference(albEvents, _.uniqWith(albEvents, comparator));
    if (duplicates.length > 0) {
      const errorMessage = [
        `ALB event in function "${duplicates[0].functionName}"`,
        ` cannot use priority "${duplicates[0].priority}" because it is already in use.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
  },

  validateMultiValueHeadersAttribute(event, functionName) {
    if (event.alb.multiValueHeaders && !_.isBoolean(event.alb.multiValueHeaders)) {
      const errorMessage = [
        `Invalid ALB event "multiValueHeaders" attribute in function "${functionName}".`,
        ' You must provide a boolean.',
      ].join('\n');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return event.alb.multiValueHeaders;
  },

  validateCognitoAuth(event, functionName) {
    if (!_.isObject(event.alb.authenticateCognito)) {
      const errorMessage = [
        `Invalid ALB event "authenticateCognito" attribute in function "${functionName}".`,
        ' You must provide a object.',
      ].join('\n');
      throw new this.serverless.classes.Error(errorMessage);
    }
    const authenticateCognitoObj = {};
    authenticateCognitoObj.userPoolArn = this.validateCognitoAuthUserPoolArn(event, functionName);
    authenticateCognitoObj.userPoolClientId = this.validateCognitoAuthUserPoolClientId(event, functionName);
    authenticateCognitoObj.userPoolDomain = this.validateCognitoAuthUserPoolDomain(event, functionName);
    authenticateCognitoObj.onUnauthenticatedRequest = this.validateCognitoAuthAllowUnauthenticated(event, functionName);
    if (event.alb.authenticateCognito.requestExtraParams)
      authenticateCognitoObj.requestExtraParams = this.validateCognitoAuthReqExtraParams(event, functionName);
    if (event.alb.authenticateCognito.scope)
      authenticateCognitoObj.scope = this.validateCognitoAuthScope(event, functionName);
    if (event.alb.authenticateCognito.sessionCookieName)
      authenticateCognitoObj.sessionCookieName = this.validateCognitoAuthSessionCookieName(event, functionName);
    if (event.alb.authenticateCognito.sessionTimeout)
      authenticateCognitoObj.sessionTimeout = this.validateCognitoAuthSessionTimeout(event, functionName);

      return authenticateCognitoObj;
  },

  validateCognitoAuthUserPoolArn(event, functionName) {
    if (!_.has(event.alb.authenticateCognito, 'userPoolArn')) {
      throw new this.serverless.classes.Error(`Missing userPoolArn for authenticateCognito in function "${functionName}".`);
    }
    const { userPoolArn } = event.alb.authenticateCognito;
    // if object means its either Ref or ImportValue
    if (_.isObject(userPoolArn)) {
      console.log('Pool ARN--->', userPoolArn);
      if (_.has(userPoolArn, 'Ref')) {
        return userPoolArn.Ref;
      }
      if (_.has(userPoolArn, 'Fn::ImportValue')) {
        return userPoolArn['Fn::ImportValue'];
      }
      throw new this.serverless.classes.Error(`Invalid userPoolArn for authenticateCognito in function "${functionName}".`);
    }
    if (!userPoolArn.match(COGNITO_USER_POOL_PATTERN)) {
      throw new this.serverless.classes.Error(`Invalid userPoolArn for authenticateCognito in function "${functionName}".`);
    }
    return userPoolArn;
  },

  validateCognitoAuthUserPoolClientId(event, functionName) {
    if (!_.has(event.alb.authenticateCognito, 'userPoolClientId')) {
      throw new this.serverless.classes.Error(`Missing userPoolClientId for authenticateCognito in function "${functionName}".`);
    }
    const { userPoolClientId } = event.alb.authenticateCognito;
    if (_.isObject(userPoolClientId)) {
      if (_.has(userPoolClientId, 'Ref')) {
        return userPoolClientId.Ref;
      }
      if (_.has(userPoolClientId, 'Fn::ImportValue')) {
        return userPoolClientId['Fn::ImportValue'];
      }
      throw new this.serverless.classes.Error(`Invalid userPoolClientId for authenticateCognito in function "${functionName}".`);
    }
    if (!_.isString(event.alb.authenticateCognito.userPoolClientId)) {
      throw new this.serverless.classes.Error(`userPoolClientId for authenticateCognito in function "${functionName}" must be of type String.`);
    }
    return event.alb.authenticateCognito.userPoolClientId;
  },

  validateCognitoAuthUserPoolDomain(event, functionName) {
    if (!_.has(event.alb.authenticateCognito, 'userPoolDomain')) {
      throw new this.serverless.classes.Error(`Missing userPoolDomain for authenticateCognito in function "${functionName}".`);
    }
    const { userPoolDomain } = event.alb.authenticateCognito;
    if (_.isObject(userPoolDomain)) {
      if (_.has(userPoolDomain, 'Ref')) {
        return userPoolDomain.Ref;
      }
      if (_.has(userPoolDomain, 'Fn::ImportValue')) {
        return userPoolDomain['Fn::ImportValue'];
      }
      throw new this.serverless.classes.Error(`Invalid userPoolDomain for authenticateCognito in function "${functionName}".`);
    }
    if (!_.isString(event.alb.authenticateCognito.userPoolDomain)) {
      throw new this.serverless.classes.Error(`userPoolDomain for authenticateCognito in function "${functionName}" must be of type String.`);
    }
    return event.alb.authenticateCognito.userPoolDomain;
  },

  validateCognitoAuthReqExtraParams(event, functionName) {
    if (!_.isObject(event.alb.authenticateCognito.requestExtraParams)) {
      throw new this.serverless.classes.Error(`requestExtraParams for authenticateCognito in function "${functionName}" must be of type Object.`);
    }
    return event.alb.authenticateCognito.requestExtraParams;
  },

  validateCognitoAuthAllowUnauthenticated(event, functionName) {
    if (event.alb.authenticateCognito.allowUnauthenticated) {
      if (!_.isBoolean(event.alb.authenticateCognito.allowUnauthenticated)) {
        throw new this.serverless.classes.Error(`allowUnauthenticated for authenticateCognito in function "${functionName}" must be of type Boolean.`);
      }
      return event.alb.authenticateCognito.allowUnauthenticated === true ? 'allow' : 'deny';
    } else
      return 'deny';
  },

  validateCognitoAuthScope(event, functionName) {
    if (!_.isString(event.alb.authenticateCognito.scope)) {
      throw new this.serverless.classes.Error(`scope for authenticateCognito in function "${functionName}" must be of type String.`);
    }
    return event.alb.authenticateCognito.scope;
  },

  validateCognitoAuthSessionCookieName(event, functionName) {
    if (!_.isString(event.alb.authenticateCognito.sessionCookieName)) {
      throw new this.serverless.classes.Error(`sessionCookieName for authenticateCognito in function "${functionName}" must be of type String.`);
    }
    return event.alb.authenticateCognito.sessionCookieName;
  },

  validateCognitoAuthSessionTimeout(event, functionName) {
    if (!_.isNumber(event.alb.authenticateCognito.sessionTimeout)) {
      throw new this.serverless.classes.Error(`sessionTimeout for authenticateCognito in function "${functionName}" must be of type Number.`);
    }
    return event.alb.authenticateCognito.sessionTimeout;
  },

  validateOidcAuth(event, functionName) {
    if (!_.isObject(event.alb.authenticateOidc)) {
      const errorMessage = [
        `Invalid ALB event "authenticateOidc" attribute in function "${functionName}".`,
        ' You must provide a object.',
      ].join('\n');
      throw new this.serverless.classes.Error(errorMessage);
    }
    const authenticateOidcObj = {};
    authenticateOidcObj.authorizationEndpoint = this.validateOidcAuthEndpoint(event, functionName);
    authenticateOidcObj.clientId = this.validateOidcAuthClientId(event, functionName);
    this.validateOidcClientSecret(event, functionName, authenticateOidcObj);
    authenticateOidcObj.issuer = this.validateOidcAuthIssuer(event, functionName);
    authenticateOidcObj.tokenEndpoint = this.validateOidcAuthTokenEndpoint(event, functionName);
    authenticateOidcObj.userInfoEndpoint = this.validateOidcAuthUserInfoEndpoint(event, functionName);
    authenticateOidcObj.onUnauthenticatedRequest = this.validateOidcAuthAllowUnauthenticated(event, functionName);
    if (event.alb.authenticateOidc.requestExtraParams)
      authenticateOidcObj.requestExtraParams = this.validateOidcAuthReqExtraParams(event, functionName);
    if (event.alb.authenticateOidc.scope)
      authenticateOidcObj.scope = this.validateOidcAuthScope(event, functionName);
    if (event.alb.authenticateOidc.sessionCookieName)
      authenticateOidcObj.sessionCookieName = this.validateOidcAuthSessionCookieName(event, functionName);
    if (event.alb.authenticateOidc.sessionTimeout)
      authenticateOidcObj.sessionTimeout = this.validateOidcAuthSessionTimeout(event, functionName);
  },

  validateOidcAuthEndpoint(event, functionName) {
    if (!_.has(event.alb.authenticateOidc, 'authorizationEndpoint')) {
      throw new this.serverless.classes.Error(`Missing authorizationEndpoint for authenticateOidc in function "${functionName}".`);
    }
    if (!this.validateUrl(event.alb.authenticateOidc.authorizationEndpoint))
      throw new this.serverless.classes.Error(`Invalid authorizationEndpoint for authenticateOidc in function "${functionName}". Must be valid url.`);
    else
      return event.alb.authenticateOidc.authorizationEndpoint;
  },

  validateOidcAuthClientId(event, functionName) {
    if (!_.has(event.alb.authenticateOidc, 'clientId')) {
      throw new this.serverless.classes.Error(`Missing clientId for authenticateOidc in function "${functionName}".`);
    }
    if (!_.isString(event.alb.authenticateOidc.clientId))
      throw new this.serverless.classes.Error(`Invalid clientId for authenticateOidc in function "${functionName}". Must be valid string.`);
    else
      return event.alb.authenticateOidc.clientId;
  },

  validateOidcClientSecret(event, functionName, obj) {
    if (!_.has(event.alb.authenticateOidc, 'clientSecret')) {
      if (!_.has(event.alb.authenticateOidc, 'useExistingClientSecret')) {
        throw new this.serverless.classes.Error(`Either clientSecret or useExistingClientSecret required for authenticateOidc in function "${functionName}".`);
      } else {
        if (event.alb.authenticateOidc.useExistingClientSecret !== true) {
          throw new this.serverless.classes.Error(`Invalid useExistingClientSecret for authenticateOidc in function "${functionName}". Must be truthy boolean when clientSecret not provided.`);
        }
        obj.useExistingClientSecret = event.alb.authenticateOidc.useExistingClientSecret;
      }
    }
    if (!_.isString(event.alb.authenticateOidc.clientSecret))
      throw new this.serverless.classes.Error(`Invalid clientSecret for authenticateOidc in function "${functionName}". Must be valid string.`);
    else
      obj.clientSecret = event.alb.authenticateOidc.clientSecret;
  },

  validateOidcAuthIssuer(event, functionName) {
    if (!_.has(event.alb.authenticateOidc, 'issuer')) {
      throw new this.serverless.classes.Error(`Missing issuer for authenticateOidc in function "${functionName}".`);
    }
    if (!this.validateUrl(event.alb.authenticateOidc.issuer))
      throw new this.serverless.classes.Error(`Invalid issuer for authenticateOidc in function "${functionName}". Must be valid url.`);
    else
      return event.alb.authenticateOidc.issuer;
  },

  validateOidcAuthTokenEndpoint(event, functionName) {
    if (!_.has(event.alb.authenticateOidc, 'tokenEndpoint')) {
      throw new this.serverless.classes.Error(`Missing tokenEndpoint for authenticateOidc in function "${functionName}".`);
    }
    if (!this.validateUrl(event.alb.authenticateOidc.tokenEndpoint))
      throw new this.serverless.classes.Error(`Invalid tokenEndpoint for authenticateOidc in function "${functionName}". Must be valid url.`);
    else
      return event.alb.authenticateOidc.tokenEndpoint;
  },

  validateOidcAuthUserInfoEndpoint(event, functionName) {
    if (!_.has(event.alb.authenticateOidc, 'userInfoEndpoint')) {
      throw new this.serverless.classes.Error(`Missing userInfoEndpoint for authenticateOidc in function "${functionName}".`);
    }
    if (!validateUrl(event.alb.authenticateOidc.userInfoEndpoint))
      throw new this.serverless.classes.Error(`Invalid userInfoEndpoint for authenticateOidc in function "${functionName}". Must be valid url.`);
    else
      return event.alb.authenticateOidc.userInfoEndpoint;
  },

  validateOidcAuthReqExtraParams(event, functionName) {
    if (!_.isObject(event.alb.authenticateOidc.requestExtraParams)) {
      throw new this.serverless.classes.Error(`Invalid requestExtraParams for authenticateOidc in function "${functionName}". Must be of type Object.`);
    }
    return event.alb.authenticateOidc.requestExtraParams;
  },

  validateOidcAuthAllowUnauthenticated(event, functionName) {
    if (event.alb.authenticateOidc.allowUnauthenticated) {
      if (!_.isBoolean(event.alb.authenticateOidc.allowUnauthenticated)) {
        throw new this.serverless.classes.Error(`allowUnauthenticated for authenticateOidc in function "${functionName}" must be of type Boolean.`);
      }
      return event.alb.authenticateOidc.allowUnauthenticated === true ? 'allow' : 'deny';
    } else
      return 'deny';
  },

  validateOidcAuthScope(event, functionName) {
    if (!_.isString(event.alb.authenticateOidc.scope)) {
      throw new this.serverless.classes.Error(`scope for authenticateOidc in function "${functionName}" must be of type Boolean.`);
    }
    return event.alb.authenticateOidc.scope;
  },

  validateOidcAuthSessionCookieName(event, functionName) {
    if (!_.isString(event.alb.authenticateOidc.sessionCookieName)) {
      throw new this.serverless.classes.Error(`sessionCookieName for authenticateOidc in function "${functionName}" must be of type String.`);
    }
    return event.alb.authenticateOidc.sessionCookieName;
  },

  validateOidcAuthSessionTimeout(event, functionName) {
    if (!_.isNumber(event.alb.authenticateOidc.sessionTimeout)) {
      throw new this.serverless.classes.Error(`sessionTimeout for authenticateOidc in function "${functionName}" must be of type Number.`);
    }
    return event.alb.authenticateOidc.sessionTimeout;
  },

  validateUrl: url => !!url.match(/(^http[s]?:\/{2})/)
};
