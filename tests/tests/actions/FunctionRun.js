'use strict';

/**
 * Test: Function Run Action
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
    assert.equal(true, typeof evt.options.name != 'undefined');
    assert.equal(true, typeof evt.data.result.response != 'undefined');
    assert.equal(true, evt.data.result.status === 'success');
};


describe('Test Action: Function Run', function() {

    before(function(done) {
        this.timeout(0);
        testUtils.createTestProject(config, ['functions'])
            .then(projectPath => {

                this.timeout(0);

                process.chdir(projectPath);


              serverless = new Serverless({
                projectPath,
                interactive: false,
                awsAdminKeyId:     config.awsAdminKeyId,
                awsAdminSecretKey: config.awsAdminSecretKey
              });

                return serverless.init()
                    .then(function() {

                        done();
                    });
            });
    });

    after(function(done) {
        done();
    });

    describe('Function Run Local', function() {
        it('should run the local function with no errors', function(done) {

            this.timeout(0);
            let options = {
                name: 'function1'
            };

            serverless.actions.functionRun(options)
                .then(function(evt) {
                    validateEvent(evt);
                    done();
                })
                .catch(e => {
                    done(e);
                });
        });
    });

    describe('Function Run Deployed', function() {
        it('should run the deployed function with no errors', function(done) {

            this.timeout(0);
            let options = {
                name: 'function1',
                stage: 'development',
                runDeployed: true
            };

            serverless.actions.functionRun(options)
                .then(function(evt) {
                    validateEvent(evt);
                    done();
                })
                .catch(e => {
                    done(e);
                });
        });
    });
});
