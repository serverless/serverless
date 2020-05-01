'use strict';

const os = require('os');
const path = require('path');
const { expect } = require('chai');

const getServerlessDir = require('./getServerlessDir.js');

describe('#getServerlessDir()', () => {
  let initialVar;

  beforeEach(() => {
    initialVar = process.env.SERVERLESS_HOME;
  });

  it('should return the default when the environment variable is not set', () => {
    delete process.env.SERVERLESS_HOME;
    const expected = path.join(os.homedir(), '.serverless');
    expect(getServerlessDir()).to.equal(expected);
  });

  it('should return the environment variable when it is set', () => {
    process.env.SERVERLESS_HOME = 'foo';
    expect(getServerlessDir()).to.equal('foo');
  });

  afterEach(() => {
    process.env.SERVERLESS_HOME = initialVar;
  });
});
