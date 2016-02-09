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
    assert.equal(true, typeof evt.options.path != 'undefined');
    assert.equal(true, typeof evt.data.result.response != 'undefined');
    assert.equal(true, evt.data.result.status === 'success');
};


describe('Test Action: Function Run', function() {

    before(function(done) {
        this.timeout(0);
        testUtils.createTestProject(config, ['nodejscomponent'])
            .then(projPath => {

                this.timeout(0);

                process.chdir(projPath);

                serverless = new Serverless({
                    interactive: true,
                    awsAdminKeyId:     config.awsAdminKeyId,
                    awsAdminSecretKey: config.awsAdminSecretKey,
                    projectPath: projPath
                });

                return serverless.state.load()
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
                path: 'nodejscomponent/group1/function1'
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
                path: 'nodejscomponent/group1/function1',
                stage: 'development'
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
