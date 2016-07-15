'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');
const ClientFactory = require('../client_factory');
const Credentials = require('../credentials');

require('chai').use(chaiAsPromised);

describe('ClientFactory', () => {
  describe('#fromWskProps()', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should instantiate openwhisk client from openwhisk authentication properties', () => {
      const mockObject = {
        apihost: 'blah.blah.com', auth: 'another_user:another_pass', namespace: 'user@user.com',
      };

      sandbox.stub(Credentials, 'getWskProps', () => Promise.resolve(mockObject));
      return ClientFactory.fromWskProps().then(client => {
        expect(client.actions.options).to.deep.equal({
          api: mockObject.apihost, api_key: mockObject.auth, namespace: mockObject.namespace,
        });
      });
    });

    it('should throw error when parameter (AUTH) is missing', () => {
      const mockObject = {
        apihost: 'blah.blah.com', namespace: 'user@user.com',
      };

      sandbox.stub(Credentials, 'getWskProps', () => Promise.resolve(mockObject));
      return expect(ClientFactory.fromWskProps()).to.be.rejectedWith(/AUTH/);
    });

    it('should throw error when parameter (APIHOST) is missing', () => {
      const mockObject = {
        auth: 'user:pass', namespace: 'user@user.com',
      };

      sandbox.stub(Credentials, 'getWskProps', () => Promise.resolve(mockObject));
      return expect(ClientFactory.fromWskProps()).to.be.rejectedWith(/APIHOST/);
    });

    it('should throw error when parameter (NAMESPACE) is missing', () => {
      const mockObject = {
        auth: 'user:pass', apihost: 'blah.blah.com',
      };

      sandbox.stub(Credentials, 'getWskProps', () => Promise.resolve(mockObject));
      return expect(ClientFactory.fromWskProps()).to.be.rejectedWith(/NAMESPACE/);
    });
  });
});
