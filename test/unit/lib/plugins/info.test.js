'use strict';

const chai = require('chai');
const Info = require('../../../../lib/plugins/info');
const Serverless = require('../../../../lib/Serverless');

const expect = chai.expect;
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('Info', () => {
  let info;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    info = new Info(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(info.commands).to.be.not.empty);
  });
});
