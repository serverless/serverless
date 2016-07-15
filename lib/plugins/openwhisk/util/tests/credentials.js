'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs-extra');
const chaiAsPromised = require('chai-as-promised');
const Credentials = require('../credentials');

require('chai').use(chaiAsPromised);

describe('#getWskProps()', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should instantiate openwhisk resources from properties file', () => {
    const mockObject = {
      apihost: 'https://openwhisk.ng.bluemix.net/api/v1/',
      auth: 'user:pass',
      namespace: 'blah@provider.com_dev',
    };

    const home = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    const wskProps =
      'APIHOST=openwhisk.ng.bluemix.net\nNAMESPACE=blah@provider.com_dev\nAUTH=user:pass\n';

    sandbox.stub(fs, 'readFile', (path, encoding, cb) => {
      expect(path.match(home).length).to.equal(1);
      expect(path.match('.wskprops').length).to.equal(1);
      cb(null, wskProps);
    });

    return expect(Credentials.getWskProps()).to.eventually.deep.equal(mockObject);
  });

  it('should instantiate openwhisk resources from environment variables', () => {
    const mockObject = {
      apihost: 'https://blah.blah.com/api/v1',
      auth: 'another_user:another_pass',
      namespace: 'user@user.com',
    };

    sandbox.stub(fs, 'readFile', (path, encoding, cb) => {
      cb(true);
    });

    process.env.OW_APIHOST = 'https://blah.blah.com/api/v1';
    process.env.OW_AUTH = 'another_user:another_pass';
    process.env.OW_NAMESPACE = 'user@user.com';

    return expect(Credentials.getWskProps()).to.eventually.deep.equal(mockObject);
  });

  it('should overwrite properties files resource variables with environment variables', () => {
    const mockObject = {
      apihost: 'https://blah.blah.com/api/v1',
      auth: 'another_user:another_pass',
      namespace: 'user@user.com',
    };

    const wskProps =
      'APIHOST=openwhisk.ng.bluemix.net\nNAMESPACE=blah@provider.com_dev\nAUTH=user:pass\n';

    sandbox.stub(fs, 'readFile', (path, encoding, cb) => {
      cb(null, wskProps);
    });

    process.env.OW_APIHOST = 'https://blah.blah.com/api/v1';
    process.env.OW_AUTH = 'another_user:another_pass';
    process.env.OW_NAMESPACE = 'user@user.com';

    return expect(Credentials.getWskProps()).to.eventually.deep.equal(mockObject);
  });
});
