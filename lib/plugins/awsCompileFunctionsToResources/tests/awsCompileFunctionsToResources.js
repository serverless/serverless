'use strict';

/**
 * Test: AwsCompileFunctionsToResources Plugin
 */

const expect = require('chai').expect;
const AwsCompileFunctionsToResources = require('../awsCompileFunctionsToResources');
const Serverless = require('../../../Serverless');

describe('CompileFunctionsToResources', () => {
  let awsCompileFunctionsToResources;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    awsCompileFunctionsToResources = new AwsCompileFunctionsToResources(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () =>
      expect(awsCompileFunctionsToResources.serverless).to.equal(serverless)
    );
  });
});
