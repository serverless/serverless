'use strict';

/**
 * Test: Serverless Function Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  path       = require('path'),
  utils      = require('../../../lib/utils/index'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless;
let instance;

describe('Test Serverless Function Class', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projectPath => {

        process.chdir(projectPath);

        // Instantiate Serverless
        serverless = new Serverless({
          projectPath,
          interactive: false
        });

        return serverless.init()
          .then(function() {

            instance = serverless.getProject().getFunction('function1');

            done();
          });
      });
  });

  after(function(done) {
    done();
  });

  describe('Tests', function() {

    it('Get instance data, without project properties', function() {
      let clone = instance.toObject();
      assert.equal(true, typeof clone._class === 'undefined');
      assert.equal(true, typeof clone._filePath === 'undefined');
      assert.equal(clone.name, 'function1');
      assert.equal(clone.endpoints.length, 1);
      assert.equal(clone.events.length, 4);
    });

    it('Get populated instance data', function() {
      let data = instance.toObjectPopulated({ stage: config.stage, region: config.region });
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
    });

    it('getDeployedName', function() {
      instance.customName = "${stage}-func";
      let data = instance.getDeployedName({ stage: config.stage, region: config.region });
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      assert.equal(true, data === config.stage + '-func');
    });

    it('getAllEndpoints', function() {
      assert.equal(instance.getAllEndpoints().length, 1);
    });

    it('getAllEvents', function() {
      assert.equal(instance.getAllEvents().length, 4);
    });

    it('getProject', function() {
      assert.equal(instance.getProject().name, 's-test-prj');
    });

    it('getTemplates', function() {
      assert.equal(instance.getTemplates()._class, 'Templates');
      assert.equal(instance.getTemplates()._parents.length, 2);
    });

    it('Set instance data', function() {
      let clone = instance.toObject();
      clone.name = 'newFunctionName';
      instance.fromObject(clone);
      assert.equal(true, instance.name === 'newFunctionName');
    });


    it('update data and save', function() {

      let funcObj = instance.toObject();
      funcObj.name = 'newFunctionName';
      instance.fromObject(funcObj);

      return instance.save()
        .then(function() {
          let savedFunctionName = utils.readFileSync(instance.getRootPath('s-function.json')).name;
          assert.equal(savedFunctionName, 'newFunctionName')
        });
    });
  });
});
