  'use strict';

  const expect = require('chai').expect;
  const AzureCompile = require('../index');
  const Serverless = require('../../../../Serverless');

  describe('#compileFunctions()', () => {
    const serverless = new Serverless();
    const azureCompile = new AzureCompile(serverless);
    azureCompile.serverless.service.resources.azure = {};

    it('should setup a map for keeping compiled function JSON', () => {
      azureCompile.setup();
      expect(Object.keys(azureCompile.serverless.service.resources.azure.functions).length)
        .to.be.equal(0);    
    });

    it('should only compile functions if the functions map exists', () => {
      azureCompile.serverless.service.resources.azure = {};
      expect(azureCompile.compileFunctions).to.throw(Error);
    });
  });