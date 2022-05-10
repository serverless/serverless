'use strict';

const chai = require('chai');
const runServerless = require('../../../utils/run-serverless');
const { version } = require('../../../../package');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('Service', () => {
  describe('#load()', () => {
    it('should reject when the service name is missing', () =>
      expect(
        runServerless({
          fixture: 'blank',
          command: 'print',
        })
      ).to.eventually.be.rejected.and.have.property('code', 'SERVICE_NAME_MISSING'));

    it('should reject if provider property is missing', () =>
      expect(
        runServerless({
          fixture: 'blank',
          configExt: { service: 'foo' },
          command: 'print',
        })
      ).to.eventually.be.rejected.and.have.property('code', 'PROVIDER_NAME_MISSING'));

    it('should reject if frameworkVersion is not satisfied', () =>
      expect(
        runServerless({
          fixture: 'aws',
          configExt: { frameworkVersion: '1.0' },
          command: 'print',
        })
      ).to.eventually.be.rejected.and.have.property('code', 'FRAMEWORK_VERSION_MISMATCH'));

    it('should pass if frameworkVersion is satisfied', () =>
      runServerless({
        fixture: 'aws',
        configExt: { frameworkVersion: version },
        command: 'print',
      })
        .then(() =>
          runServerless({
            fixture: 'aws',
            configExt: { frameworkVersion: '*' },
            command: 'print',
          })
        )
        .then(() =>
          runServerless({
            fixture: 'aws',
            configExt: { frameworkVersion: version.split('.')[0] },
            command: 'print',
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
        command: 'package',
      }).then(({ cfTemplate: { Resources } }) => {
        expect(Resources).to.be.an('object');
        expect(Resources.resource1).to.deep.equal({ Type: 'value' });
        expect(Resources.resource2).to.deep.equal({ Type: 'value2' });
      }));

    it('should merge functions given as an array', () =>
      runServerless({
        fixture: 'aws',
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
        command: 'print',
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
    it('should make sure function name contains the default stage', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'package',
      });
      expect(
        cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties.FunctionName
      ).to.include('dev-basic');
    });

    it('should throw when receives function with non-object configuration', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              bar: true,
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'NON_OBJECT_FUNCTION_CONFIGURATION_ERROR'
      );
    });
  });
});
