'use strict';

const _ = require('lodash');
const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#validate()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  describe('#validateAuthorizers()', () => {
    let baseAlbConfig;

    beforeEach(() => {
      baseAlbConfig = {
        authenticateCognito: {
          userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
          userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
          userPoolDomain: 'your-test-domain',
          onUnauthenticatedRequest: 'allow',
        },
        authenticateOidc: {
          authorizationEndpoint: 'https://example.com',
          clientId: 'i-am-client',
          clientSecret: 'i-am-secret',
          issuer: 'https://www.iamscam.com',
          tokenEndpoint: 'http://somewhere.org',
          userInfoEndpoint: 'https://another-example.com',
          onUnauthenticatedRequest: 'deny',
        }
      };
    })

    describe('authenticateCognito', () => {

      beforeEach(() => {
        delete baseAlbConfig.authenticateOidc;
      })

      it('returns valid cognito authentication config', () => {
        baseAlbConfig.authenticateCognito.requestExtraParams = { preference: 'azure' };
        baseAlbConfig.authenticateCognito.scope = 'first_name age';
        baseAlbConfig.authenticateCognito.sessionCookieName = 'x-api-key';
        baseAlbConfig.authenticateCognito.sessionTimeout = 7000;
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: baseAlbConfig };
  
        expect(awsCompileAlbEvents.validateAuthorizers()).to.deep.equal({
          authenticateCognito: {
            userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
            userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
            userPoolDomain: 'your-test-domain',
            onUnauthenticatedRequest: 'deny',
            requestExtraParams: {
              preference: 'azure',
            },
            scope: 'first_name age',
            sessionCookieName: 'x-api-key',
            sessionTimeout: 7000,
          }
        });
      });

      it('returns valid cognito authentication config when allowUnauthenticated is true', () => {
        baseAlbConfig.authenticateCognito.allowUnauthenticated = true;
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: baseAlbConfig };
  
        expect(awsCompileAlbEvents.validateAuthorizers()).to.deep.equal({
          authenticateCognito: {
            userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
            userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
            userPoolDomain: 'your-test-domain',
            onUnauthenticatedRequest: 'allow',
          }
        });
      });

      it('throws an error when authenticateCognito is not of type Object', () => {
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: { authenticateCognito: '' } };
        expect(() => awsCompileAlbEvents.validateAuthorizers()).to.throw('Invalid ALB authorizer "authenticateCognito" in provider. You must provide an object');
      });

    })

    describe('authenticateOidc', () => {

      beforeEach(() => {
        delete baseAlbConfig.authenticateCognito;
      })

      it('returns valid oidc authentication config', () => { 
        baseAlbConfig.authenticateOidc.requestExtraParams = { key: 'value' };
        baseAlbConfig.authenticateOidc.scope = 'first_name other_name';
        baseAlbConfig.authenticateOidc.sessionCookieName = '🍪';
        baseAlbConfig.authenticateOidc.sessionTimeout = 15;
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: baseAlbConfig };
  
        expect(awsCompileAlbEvents.validateAuthorizers()).to.deep.equal({
          authenticateOidc: {
            authorizationEndpoint: 'https://example.com',
            clientId: 'i-am-client',
            clientSecret: 'i-am-secret',
            issuer: 'https://www.iamscam.com',
            tokenEndpoint: 'http://somewhere.org',
            userInfoEndpoint: 'https://another-example.com',
            onUnauthenticatedRequest: 'deny',
            requestExtraParams: {
              key: 'value',
            },
            scope: 'first_name other_name',
            sessionCookieName: '🍪',
            sessionTimeout: 15,
          }
        });
      });

      it('returns valid oidc authentication config when allowUnauthenticated is true', () => {
        baseAlbConfig.authenticateOidc.allowUnauthenticated = true;
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: baseAlbConfig };
        expect(awsCompileAlbEvents.validateAuthorizers()).to.deep.equal({
          authenticateOidc: {
            authorizationEndpoint: 'https://example.com',
            clientId: 'i-am-client',
            clientSecret: 'i-am-secret',
            issuer: 'https://www.iamscam.com',
            tokenEndpoint: 'http://somewhere.org',
            userInfoEndpoint: 'https://another-example.com',
            onUnauthenticatedRequest: 'allow',
          }
        });
      });

      it('returns valid oidc authentication config when clientSecret is omitted and useExistingClientSecret provided', () => {
        delete baseAlbConfig.authenticateOidc.clientSecret;
        baseAlbConfig.authenticateOidc.useExistingClientSecret = true;
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: baseAlbConfig };
        expect(awsCompileAlbEvents.validateAuthorizers()).to.deep.equal({
          authenticateOidc: {
            authorizationEndpoint: 'https://example.com',
            clientId: 'i-am-client',
            onUnauthenticatedRequest: 'deny',
            issuer: 'https://www.iamscam.com',
            tokenEndpoint: 'http://somewhere.org',
            userInfoEndpoint: 'https://another-example.com',
            useExistingClientSecret: true,
          }
        });
      });

      it('throws an error when authenticateOidc is not of type Object', () => {
        awsCompileAlbEvents.serverless.service.provider.alb = { authorizers: { authenticateOidc: '' } };
        expect(() => awsCompileAlbEvents.validateAuthorizers()).to.throw('Invalid ALB authorizer "authenticateOidc" in provider. You must provide an object');
      });

    })

  });

});
