'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../../test/utils/run-serverless');

chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('ApiGatewayEvents', () => {
  describe('Request parameters', () => {
    let cfResources;
    let naming;
    before(() =>
      runServerless({
        fixture: 'apiGateway',
        configExt: {
          functions: {
            foo: {
              events: [
                {
                  http: {
                    method: 'get',
                    path: '/foo',
                    integration: 'HTTP_PROXY',
                    request: {
                      uri: 'someUri',
                      parameters: {
                        headers: {
                          someRequiredHeader: true,
                          someOptionalHeader: false,
                          someRequiredMappedHeader: {
                            required: true,
                            mappedValue: 'someRequiredValue',
                          },
                          someOptionalMappedHeader: {
                            required: false,
                            mappedValue: 'someOptionalValue',
                          },
                        },
                        paths: {
                          somePathParam: true,
                          someMappedPathParam: {
                            required: true,
                            mappedValue: 'someValue',
                          },
                        },
                        querystrings: {
                          someQueryString: true,
                          someMappedQueryString: {
                            required: true,
                            mappedValue: 'someValue',
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        cliArgs: ['package'],
      }).then(({ cfTemplate, awsNaming }) => {
        ({ Resources: cfResources } = cfTemplate);
        naming = awsNaming;
      })
    );

    it('Should set required headers, querystring, and path params', () => {
      const methodResourceProps = cfResources[naming.getMethodLogicalId('Foo', 'get')].Properties;
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.header.someRequiredHeader',
        true
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.header.someOptionalHeader',
        false
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.header.someRequiredMappedHeader',
        true
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.header.someOptionalMappedHeader',
        false
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.path.somePathParam',
        true
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.path.someMappedPathParam',
        true
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.querystring.someQueryString',
        true
      );
      expect(methodResourceProps.RequestParameters).to.have.property(
        'method.request.querystring.someMappedQueryString',
        true
      );
    });

    it('Should map integration request values', () => {
      const methodResourceProps = cfResources[naming.getMethodLogicalId('Foo', 'get')].Properties;
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.header.someRequiredHeader',
        'method.request.header.someRequiredHeader'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.header.someOptionalHeader',
        'method.request.header.someOptionalHeader'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.header.someRequiredMappedHeader',
        'someRequiredValue'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.header.someOptionalMappedHeader',
        'someOptionalValue'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.path.somePathParam',
        'method.request.path.somePathParam'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.path.someMappedPathParam',
        'someValue'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.querystring.someQueryString',
        'method.request.querystring.someQueryString'
      );
      expect(methodResourceProps.Integration.RequestParameters).to.have.property(
        'integration.request.querystring.someMappedQueryString',
        'someValue'
      );
    });
  });
});
