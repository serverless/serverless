'use strict';

const expect = require('chai').expect;

const ServerlessError = require('../../../../lib/serverless-error');
const tokenizeError = require('../../../../lib/utils/tokenize-exception');

describe('test/unit/lib/utils/tokenize-exception.test.js', () => {
  it('Should tokenize user error', () => {
    const errorTokens = tokenizeError(
      new ServerlessError('Some error', 'ERR_CODE', { decoratedMessage: 'decorated' })
    );
    expect(errorTokens.title).to.equal('Serverless Error');
    expect(errorTokens.name).to.equal('ServerlessError');
    expect(errorTokens.stack).to.include('tokenize-exception.test.js:');
    expect(errorTokens.message).to.equal('Some error');
    expect(errorTokens.isUserError).to.equal(true);
    expect(errorTokens.code).to.equal('ERR_CODE');
    expect(errorTokens.decoratedMessage).to.equal('decorated');
  });

  it('Should tokenize programmer error', () => {
    const errorTokens = tokenizeError(new TypeError('Some error'));
    expect(errorTokens.title).to.equal('Type Error');
    expect(errorTokens.name).to.equal('TypeError');
    expect(errorTokens.stack).to.include('tokenize-exception.test.js:');
    expect(errorTokens.message).to.equal('Some error');
    expect(errorTokens.isUserError).to.equal(false);
  });

  it('Should tokenize non-error exception', () => {
    const errorTokens = tokenizeError(null);
    expect(errorTokens.title).to.equal('Exception');
    expect(errorTokens.message).to.equal('null');
    expect(errorTokens.isUserError).to.equal(false);
  });
});
