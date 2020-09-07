'use strict';

const chai = require('chai');
const runServerless = require('../../test/utils/run-serverless');
const fixtures = require('../../test/fixtures');
const { version } = require('../../package');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('Service', () => {
  after(fixtures.cleanup);

  describe('#load()', () => {
    it('should load serverless.yml from filesystem', () =>
      runServerless({
        cwd: fixtures.map.configTypeYml,
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { service, provider },
          },
        }) => {
          expect(service).to.be.equal('yml-service');
          expect(provider.name).to.deep.equal('yml-provider');
        }
      ));

    it('should load serverless.yaml from filesystem', () =>
      runServerless({
        cwd: fixtures.map.configTypeYaml,
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
        cwd: fixtures.map.configTypeJson,
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
        cwd: fixtures.map.configTypeJs,
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
        cwd: fixtures.map.configTypeJsDeferred,
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
          cwd: fixtures.map.configTypeNonObject,
          cliArgs: ['print'],
        })
      ).to.eventually.be.rejected.and.have.property('code', 'INVALID_CONFIG_OBJECT_TYPE'));

    it('should load YAML in favor of JSON', () =>
      runServerless({
        cwd: fixtures.map.configTypeYmlAndJson,
        cliArgs: ['print'],
      }).then(
        ({
          serverless: {
            service: { service, provider },
          },
        }) => {
          expect(service).to.be.equal('yml-service');
          expect(provider.name).to.deep.equal('yml-provider');
        }
      ));

    it('should reject when the service name is missing', () =>
      expect(
        runServerless({
          cwd: fixtures.map.configInvalid,
          cliArgs: ['print'],
        })
      ).to.eventually.be.rejected.and.have.property('code', 'SERVICE_NAME_MISSING'));

    it('should reject if provider property is missing', () =>
      expect(
        fixtures.extend('configInvalid', { service: 'foo' }).then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['print'],
          })
        )
      ).to.eventually.be.rejected.and.have.property('code', 'PROVIDER_NAME_MISSING'));

    it('should reject if frameworkVersion is not satisfied', () =>
      expect(
        fixtures.extend('configTypeYml', { frameworkVersion: '1.0' }).then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['print'],
          })
        )
      ).to.eventually.be.rejected.and.have.property('code', 'FRAMEWORK_VERSION_MISMATCH'));

    it('should pass if frameworkVersion is satisfied', () =>
      fixtures
        .extend('configTypeYml', { frameworkVersion: version })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['print'],
          })
        )
        .then(() =>
          fixtures.extend('configTypeYml', { frameworkVersion: '*' }).then(fixturePath =>
            runServerless({
              cwd: fixturePath,
              cliArgs: ['print'],
            })
          )
        )
        .then(() =>
          fixtures
            .extend('configTypeYml', { frameworkVersion: version.split('.')[0] })
            .then(fixturePath =>
              runServerless({
                cwd: fixturePath,
                cliArgs: ['print'],
              })
            )
        ));
  });

  describe('#mergeArrays', () => {
    it('should merge resources given as an array', () =>
      fixtures
        .extend('aws', {
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
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          })
        )
        .then(({ cfTemplate: { Resources } }) => {
          expect(Resources).to.be.an('object');
          expect(Resources.resource1).to.deep.equal({ Type: 'value' });
          expect(Resources.resource2).to.deep.equal({ Type: 'value2' });
        }));

    it('should merge functions given as an array', () =>
      fixtures
        .extend('configTypeYml', {
          functions: [
            {
              a: {},
            },
            {
              b: {},
            },
          ],
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['print'],
          })
        )
        .then(
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
        cwd: fixtures.map.function,
        cliArgs: ['package'],
      }).then(({ cfTemplate, awsNaming }) =>
        expect(
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('foo')].Properties.FunctionName
        ).to.be.equal('service-dev-foo')
      ));
  });
});
