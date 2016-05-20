'use strict';

const expect = require('chai').expect;
const Serverless = require('../../../lib/Serverless');

describe('Serverless', () => {
  describe('#getVersion()', () => {
    it('should get the correct serverless version', () => {
      const serverless = new Serverless();
      expect(serverless.getVersion()).to.match(/^(\d+\.)?(\d+\.)?(\*|\d+)$/);
    });
  });
});
