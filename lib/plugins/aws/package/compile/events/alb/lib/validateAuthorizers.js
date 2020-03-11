'use strict';

const _ = require('lodash');

module.exports = {
  validateAuthorizers() {
    const albAuthConfig = this.serverless.service.provider.alb;
    if (!albAuthConfig) {
      return null;
    }
    const authorizers = {};
    if (_.has(albAuthConfig.authorizers, 'authenticateCognito')) {
      authorizers.authenticateCognito = this.validateCognitoAuth(
        albAuthConfig.authorizers.authenticateCognito
      );
    }
    if (_.has(albAuthConfig.authorizers, 'authenticateOidc')) {
      authorizers.authenticateOidc = this.validateOidcAuth(
        albAuthConfig.authorizers.authenticateOidc
      );
    }

    return authorizers;
  },

  validateCognitoAuth(authenticateCognito) {
    if (!_.isObject(authenticateCognito)) {
      const errorMessage =
        'Invalid ALB authorizer "authenticateCognito" in provider. You must provide an object';
      throw new this.serverless.classes.Error(errorMessage);
    }
    const authenticateCognitoObj = {};
    authenticateCognitoObj.userPoolArn = authenticateCognito.userPoolArn;
    authenticateCognitoObj.userPoolClientId = authenticateCognito.userPoolClientId;
    authenticateCognitoObj.userPoolDomain = authenticateCognito.userPoolDomain;
    if (authenticateCognito.allowUnauthenticated) {
      authenticateCognitoObj.onUnauthenticatedRequest =
        authenticateCognito.allowUnauthenticated === true ? 'allow' : 'deny';
    } else {
      authenticateCognitoObj.onUnauthenticatedRequest = 'deny';
    }
    if (authenticateCognito.requestExtraParams) {
      authenticateCognitoObj.requestExtraParams = authenticateCognito.requestExtraParams;
    }
    if (authenticateCognito.scope) {
      authenticateCognitoObj.scope = authenticateCognito.scope;
    }
    if (authenticateCognito.sessionCookieName) {
      authenticateCognitoObj.sessionCookieName = authenticateCognito.sessionCookieName;
    }
    if (authenticateCognito.sessionTimeout) {
      authenticateCognitoObj.sessionTimeout = authenticateCognito.sessionTimeout;
    }

    return authenticateCognitoObj;
  },

  validateOidcAuth(authenticateOidc) {
    if (!_.isObject(authenticateOidc)) {
      const errorMessage =
        'Invalid ALB authorizer "authenticateOidc" in provider. You must provide an object';
      throw new this.serverless.classes.Error(errorMessage);
    }
    const authenticateOidcObj = {};
    authenticateOidcObj.authorizationEndpoint = authenticateOidc.authorizationEndpoint;
    authenticateOidcObj.clientId = authenticateOidc.clientId;
    authenticateOidcObj.issuer = authenticateOidc.issuer;
    if (_.has(authenticateOidc, 'clientSecret')) {
      authenticateOidcObj.clientSecret = authenticateOidc.clientSecret;
    } else {
      authenticateOidcObj.useExistingClientSecret = authenticateOidc.useExistingClientSecret;
    }
    authenticateOidcObj.tokenEndpoint = authenticateOidc.tokenEndpoint;
    authenticateOidcObj.userInfoEndpoint = authenticateOidc.userInfoEndpoint;
    if (authenticateOidc.allowUnauthenticated) {
      authenticateOidcObj.onUnauthenticatedRequest =
        authenticateOidc.allowUnauthenticated === true ? 'allow' : 'deny';
    } else {
      authenticateOidcObj.onUnauthenticatedRequest = 'deny';
    }
    if (authenticateOidc.requestExtraParams) {
      authenticateOidcObj.requestExtraParams = authenticateOidc.requestExtraParams;
    }
    if (authenticateOidc.scope) {
      authenticateOidcObj.scope = authenticateOidc.scope;
    }
    if (authenticateOidc.sessionCookieName) {
      authenticateOidcObj.sessionCookieName = authenticateOidc.sessionCookieName;
    }
    if (authenticateOidc.sessionTimeout) {
      authenticateOidcObj.sessionTimeout = authenticateOidc.sessionTimeout;
    }
    return authenticateOidcObj;
  },
};
