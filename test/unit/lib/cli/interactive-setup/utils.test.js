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
          '@serverless/dashboard-plugin/lib/resolve-provider-credentials': () => {
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
          '@serverless/dashboard-plugin/lib/resolve-provider-credentials': () => {
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
          '@serverless/dashboard-plugin/lib/resolve-provider-credentials': () => {
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

  describe('resolveInitialContext', () => {
    it('correctly resolves for service context and dashboard enabled', async () => {
      const configuration = {
        app: 'someapp',
        service: 'someservice',
        org: 'someorg',
      };
      const serviceDir = '/path/to/service/dir';
      const { resolveInitialContext } = proxyquire(
        '../../../../../lib/cli/interactive-setup/utils',
        {
          '@serverless/dashboard-plugin/lib/is-authenticated': () => true,
          '../../aws/has-local-credentials': () => true,
        }
      );
      expect(resolveInitialContext({ configuration, serviceDir })).to.deep.equal({
        hasLocalAwsCredentials: true,
        isLoggedIntoDashboard: true,
        isDashboardEnabled: true,
        isInServiceContext: true,
      });
    });

    it('correctly resolves without service context', async () => {
      const configuration = null;
      const serviceDir = null;
      const { resolveInitialContext } = proxyquire(
        '../../../../../lib/cli/interactive-setup/utils',
        {
          '@serverless/dashboard-plugin/lib/is-authenticated': () => true,
          '../../aws/has-local-credentials': () => true,
        }
      );
      expect(resolveInitialContext({ configuration, serviceDir })).to.deep.equal({
        hasLocalAwsCredentials: true,
        isLoggedIntoDashboard: true,
        isDashboardEnabled: false,
        isInServiceContext: false,
      });
    });
  });
});
