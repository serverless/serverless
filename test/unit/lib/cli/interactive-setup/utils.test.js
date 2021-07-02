'use strict';

const chai = require('chai');

const proxyquire = require('proxyquire');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/cli/interactive-setup/utils.test.js', () => {
  describe('doesServiceInstanceHaveLinkedProvider', () => {
    const configuration = {
      app: 'someapp',
      service: 'someservice',
      org: 'someorg',
    };
    const options = {};

    it('correctly resolves when credentials resolved', async () => {
      const { doesServiceInstanceHaveLinkedProvider } = proxyquire(
        '../../../../../lib/cli/interactive-setup/utils',
        {
          '@serverless/dashboard-plugin/lib/resolveProviderCredentials': () => {
            return {
              accessKeyId: 'someaccess',
              secretAccessKey: 'somesecret',
              sessionToken: 'sometoken',
            };
          },
        }
      );
      expect(await doesServiceInstanceHaveLinkedProvider({ configuration, options })).to.be.true;
    });

    it('correctly resolves when credentials missing', async () => {
      const { doesServiceInstanceHaveLinkedProvider } = proxyquire(
        '../../../../../lib/cli/interactive-setup/utils',
        {
          '@serverless/dashboard-plugin/lib/resolveProviderCredentials': () => {
            return null;
          },
        }
      );
      expect(await doesServiceInstanceHaveLinkedProvider({ configuration, options })).to.be.false;
    });

    it('throws when credentials resolution results in an error', async () => {
      const { doesServiceInstanceHaveLinkedProvider } = proxyquire(
        '../../../../../lib/cli/interactive-setup/utils',
        {
          '@serverless/dashboard-plugin/lib/resolveProviderCredentials': () => {
            const err = new Error('Error');
            err.statusCode = 500;
            throw err;
          },
        }
      );
      expect(
        doesServiceInstanceHaveLinkedProvider({ configuration, options })
      ).to.eventually.be.rejected.and.have.property('code', 'DASHBOARD_UNAVAILABLE');
    });
  });
});
