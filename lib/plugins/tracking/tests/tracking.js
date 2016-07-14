'use strict';

const expect = require('chai').expect;
const Tracking = require('../tracking');
const Serverless = require('../../../Serverless');
const path = require('path');
const os = require('os');
const fse = require('fs-extra');

describe('Tracking', () => {
  let tracking;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    tracking = new Tracking(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(tracking.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(tracking.commands).to.be.not.empty);

    it('should have hooks', () => expect(tracking.hooks).to.be.not.empty);
  });

  describe('#tracking()', () => {
    beforeEach(() => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      fse.mkdirsSync(tmpDirPath);

      serverless.config.serverlessPath = tmpDirPath;
    });

    it('should write a file in the Serverless path if tracking is disabled', () => {
      tracking.options = { enabled: 'no' };

      tracking.toggleTracking();

      expect(
        serverless.utils.fileExistsSync(path.join(tracking.serverless.config.serverlessPath,
          'do-not-track'))
      ).to.equal(true);
    });

    it('should remove the file in the Serverless path if tracking is enabled', () => {
      tracking.options = { enabled: 'yes' };

      tracking.toggleTracking();

      expect(
        serverless.utils.fileExistsSync(path.join(tracking.serverless.config.serverlessPath,
          'do-not-track'))
      ).to.equal(false);
    });
  });
});
