'use strict';

/**
 * Test: Function Deploy Action
 */

let Serverless  = require('../../../lib/Serverless.js'),
  path        = require('path'),
  utils       = require('../../../lib/utils/index'),
  assert      = require('chai').assert,
  testUtils   = require('../../test_utils'),
  AWS         = require('aws-sdk'),
  config      = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.stage != 'undefined');
  assert.equal(true, typeof evt.options.region != 'undefined');
  assert.equal(true, typeof evt.options.aliasFunction != 'undefined');
  assert.equal(true, typeof evt.options.paths != 'undefined');


  if (evt.data.failed) {
    for (let i = 0; i < Object.keys(evt.data.failed).length; i++) {
      console.log(Object.keys(evt.data.failed)[i]);
      console.log(evt.data.failed[Object.keys(evt.data.failed)[i]]);
    }
  }
  console.log(evt);
  assert.equal(true, typeof evt.data.failed === 'undefined');
  assert.equal(true, typeof evt.data.deployed != 'undefined');
};

/**
 * Test Cleanup
 * - Remove Event Source mapping
 */

let cleanup = function(UUID, cb) {
  let awsConfig = {
    region:          config.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  };

  let lambda = new AWS.Lambda(awsConfig);

  let params = {
    UUID: UUID
  };

  lambda.deleteEventSourceMapping(params, function(e, data) {
    if (e) {
      cb(e)
    } else {
      cb()
    }
  });
};

/**
 * Create Test Project
 */

describe('Test Action: Function Deploy', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config, ['nodejscomponent'])
      .then(projPath => {

        process.chdir(projPath);

        serverless = new Serverless({
          interactive:       false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey,
          projectPath:       projPath
        });

        return serverless.state.load().then(function() {
          done();
        });
      });
  });

  after(function(done) {
    done();
  });

  /**
   * Tests
   */

  describe('Function Deploy: Specify One Path', function() {
    it('should deploy functions', function(done) {

      this.timeout(0);

      let options = {
        stage:      config.stage,
        region:     config.region,
        paths:      [
          'nodejscomponent/module1/function1'
        ]
      };

      serverless.actions.functionDeploy(options)
        .then(function(evt) {
          validateEvent(evt);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });

  //describe('Function Deploy: Specify One Path with S3 event source', function() {
  //  it('should deploy function and S3 event source', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      paths:      [
  //        'nodejscomponent/module1/function1'
  //      ]
  //    };
  //
  //    serverless.actions.functionDeploy(event)
  //      .then(function(evt) {
  //        validateEvent(evt);
  //        let awsConfig = {
  //          region:          config.region,
  //          accessKeyId:     config.awsAdminKeyId,
  //          secretAccessKey: config.awsAdminSecretKey,
  //        };
  //        let eventSource = {
  //          bucket: 's3-event-source-test',
  //          bucketEvents: ['s3:ObjectCreated:*']
  //        };
  //        Eventsutils.s3(awsConfig, null, eventSource, done);
  //
  //        //done();
  //      })
  //      .catch(e => {
  //        done(e);
  //      });
  //  });
  //});

  //describe('Function Deploy: Specify One with event source', function() {
  //  it('should deploy functions and event source', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      paths:      [
  //        'nodejscomponent/module1/function1'
  //      ]
  //    };
  //
  //    serverless.actions.functionDeploy(event)
  //      .then(function(evt) {
  //        validateEvent(evt);
  //
  //        // validate event source was created and returned UUID
  //        assert.equal(true, typeof evt.functions[0].events[0].UUID != 'undefined');
  //
  //
  //        cleanup(evt.functions[0].events[0].UUID, done);
  //
  //      })
  //      .catch(e => {
  //        done(e);
  //      });
  //  });
  //});

  //describe('Function Deploy: Specify All Paths', function() {
  //  it('should deploy code', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      all:        true
  //    };
  //
  //    serverless.actions.functionDeploy(event)
  //        .then(function(evt) {
  //          validateEvent(evt);
  //
  //          cleanup(evt.functions[1].events[0].UUID, done);
  //
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});
});
