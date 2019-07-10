'use strict';

const chai = require('chai');
const InteractiveCli = require('./');
const Serverless = require('../../Serverless');

const expect = chai.expect;
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('interactiveCli', () => {
  let interactiveCli;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.processedInput = { commands: [], options: {} };
    const backupIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    try {
      interactiveCli = new InteractiveCli(serverless);
    } finally {
      process.stdin.isTTY = backupIsTTY;
    }
  });

  it('should have commands', () => expect(interactiveCli.commands).to.be.not.empty);
});
