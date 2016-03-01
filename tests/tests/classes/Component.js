'use strict';

/**
 * Test: Serverless Component Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  SPlugin    = require('../../../lib/Plugin'),
  path       = require('path'),
  utils      = require('../../../lib/utils/index'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless;
let instance;

describe('Test Serverless Component Class', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projectPath => {

        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false
        });

        return serverless.init()
          .then(function() {

            instance = serverless.getProject().getComponent('nodejscomponent');

            done();
          });
      });
  });

  after(function(done) {
    done();
  });

  describe('Tests', function() {

    it('Get instance data, without component properties', function() {
      let clone = instance.toObject();

      assert.equal(true, typeof clone._class === 'undefined');
      assert.equal(true, typeof clone.templates._class === 'undefined');
      assert.equal(true, typeof clone._runtime === 'undefined');
      assert.equal(clone.runtime, 'nodejs');
      assert.equal(clone.name, 'nodejscomponent');
    });

    it('getRuntime', function() {
      assert.equal(instance.getRuntime().name, 'nodejs');
    });

    it('getProject', function() {
      assert.equal(instance.getProject().name, 's-test-prj');
    });

    it('getAllFunctions', function() {
      assert.equal(instance.getAllFunctions().length, 5);

      // make sure the functions array is an array of function classes, not objects
      assert.equal(instance.getAllFunctions()[0]._class, 'Function')
    });

    it('getTemplates', function() {
      assert.equal(instance.getTemplates()._class, 'Templates');
      assert.equal(instance.getTemplates().apiRequestTemplate != 'undefined', true);
      assert.equal(instance.getTemplates()._parents.length, 1);
    });

    it('fromObject', function() {
      let componentObj = instance.toObject();

      componentObj.name = 'newComponentName';
      componentObj.runtime = 'python2.7';

      instance.fromObject(componentObj);

      assert.equal(instance.getName(), 'newComponentName');
      assert.equal(instance.getRuntime().name, 'python2.7');
    });

    it('update data and save', function() {

      let componentObj = instance.toObject();
      componentObj.name = 'newComponentName';
      instance.fromObject(componentObj);

      return instance.save()
          .then(function() {
            let savedComponentName = utils.readAndParseJsonSync(path.join(serverless.getProject().getFilePath1(), instance.getRootPath('s-component.json'))).name;
            assert.equal(savedComponentName, 'newComponentName')
          })
    });
  });
});
