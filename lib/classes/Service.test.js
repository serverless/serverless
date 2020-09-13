'use strict';

const chai = require('chai');
const runServerless = require('../../test/utils/run-serverless');
const { version } = require('../../package');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('Service', () => {
  describe('#load()', () => {
    it('should load serverless.yml from filesystem', () =>
      runServerless({
        fixture: 'configTypeYml',
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { provider },
          },
        }) => {
          expect(provider.name).to.deep.equal('yml-provider');
        }
      ));

    it('should load serverless.yaml from filesystem', () =>
      runServerless({
        fixture: 'configTypeYaml',
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { service, provider },
          },
        }) => {
          expect(service).to.be.equal('yaml-service');
          expect(provider.name).to.deep.equal('yaml-provider');
        }
      ));

    it('should load serverless.json from filesystem', () =>
      runServerless({
        fixture: 'configTypeJson',
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { service, provider },
          },
        }) => {
          expect(service).to.be.equal('json-service');
          expect(provider.name).to.deep.equal('json-provider');
        }
      ));

    it('should load serverless.js from filesystem', () =>
      runServerless({
        fixture: 'configTypeJs',
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { service, provider },
          },
        }) => {
          expect(service).to.be.equal('js-service');
          expect(provider.name).to.deep.equal('js-provider');
        }
      ));

    it('should support promise result in serverless.js', () =>
      runServerless({
        fixture: 'configTypeJsDeferred',
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { service, provider },
          },
        }) => {
          expect(service).to.be.equal('js-service');
          expect(provider.name).to.deep.equal('js-provider');
        }
      ));

    it('should throw error if config exports non object value', () =>
      expect(
        runServerless({
          fixture: 'configTypeNonObject',
          cliArgs: ['print'],
        })
      ).to.eventually.be.rejected.and.have.property('code', 'INVALID_CONFIG_OBJECT_TYPE'));

    it('should load YAML in favor of JSON', () =>
      runServerless({
        fixture: 'configTypeYmlAndJson',
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { provider },
          },
        }) => {
          expect(provider.name).to.deep.equal('yml-provider');
        }
      ));

    it('should reject when the service name is missing', () =>
      expect(
        runServerless({
          fixture: 'configInvalid',
          cliArgs: ['print'],
        })
      ).to.eventually.be.rejected.and.have.property('code', 'SERVICE_NAME_MISSING'));

    it('should reject if provider property is missing', () =>
      expect(
        runServerless({
          fixture: 'configInvalid',
          configExt: { service: 'foo' },
          cliArgs: ['print'],
        })
      ).to.eventually.be.rejected.and.have.property('code', 'PROVIDER_NAME_MISSING'));

    it('should reject if frameworkVersion is not satisfied', () =>
      expect(
        runServerless({
          fixture: 'configTypeYml',
          configExt: { frameworkVersion: '1.0' },
          cliArgs: ['print'],
        })
      ).to.eventually.be.rejected.and.have.property('code', 'FRAMEWORK_VERSION_MISMATCH'));

    it('should pass if frameworkVersion is satisfied', () =>
      runServerless({
        fixture: 'configTypeYml',
        configExt: { frameworkVersion: version },
        cliArgs: ['print'],
      })
        .then(() =>
          runServerless({
            fixture: 'configTypeYml',
            configExt: { frameworkVersion: '*' },
            cliArgs: ['print'],
          })
        )
        .then(() =>
          runServerless({
            fixture: 'configTypeYml',
            configExt: { frameworkVersion: version.split('.')[0] },
            cliArgs: ['print'],
          })
        ));
  });

  describe('#mergeArrays', () => {
    it('should merge resources given as an array', () =>
      runServerless({
        fixture: 'aws',
        configExt: {
          resources: [
            {
              Resources: {
                resource1: {
                  Type: 'value',
                },
              },
            },
            {
              Resources: {
                resource2: {
                  Type: 'value2',
                },
              },
            },
          ],
        },
        cliArgs: ['package'],
      }).then(({ cfTemplate: { Resources } }) => {
        expect(Resources).to.be.an('object');
        expect(Resources.resource1).to.deep.equal({ Type: 'value' });
        expect(Resources.resource2).to.deep.equal({ Type: 'value2' });
      }));

    it('should merge functions given as an array', () =>
      runServerless({
        fixture: 'configTypeYml',
        configExt: {
          functions: [
            {
              a: {},
            },
            {
              b: {},
            },
          ],
        },
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { functions },
          },
        }) => {
          expect(functions).to.be.an('object');
          expect(functions.a).to.be.an('object');
          expect(functions.b).to.be.an('object');
        }
      ));
  });

  describe('#setFunctionNames()', () => {
    it('should make sure function name contains the default stage', () =>
      runServerless({
        fixture: 'function',
        cliArgs: ['package'],
      }).then(({ cfTemplate, awsNaming }) =>
        expect(
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('foo')].Properties.FunctionName
        ).to.include('dev-foo')
      ));
  });
});
