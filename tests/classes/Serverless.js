'use strict';

const expect = require('chai').expect;
const Serverless = require('../../lib/Serverless');
const semverRegex = require('semver-regex');

describe('Serverless', () => {
  describe('#getVersion()', () => {
    it('should get the correct serverless version', () => {
      const serverless = new Serverless();
      expect(semverRegex().test(serverless.getVersion())).to.equal(true);
    });
  });
});
