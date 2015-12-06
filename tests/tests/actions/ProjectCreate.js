'use strict';

/**
 * Test: Project Create Action
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */

let Serverless  = require('../../../lib/Serverless'),
    SError      = require('../../../lib/ServerlessError'),
    path        = require('path'),
    os          = require('os'),
    uuid        = require('node-uuid'),
    utils       = require('../../../lib/utils/index'),
    assert      = require('chai').assert,
    shortid     = require('shortid'),
    config      = require('../../config');

// Instantiate JAWS
let serverless = new Serverless({
  interactive: false,
  awsAdminKeyId: config.awsAdminKeyId,
  awsAdminSecretKey: config.awsAdminSecretKey,
});

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.name != 'undefined');
  assert.equal(true, typeof evt.domain != 'undefined');
  assert.equal(true, typeof evt.notificationEmail != 'undefined');
  assert.equal(true, typeof evt.region != 'undefined');
  assert.equal(true, typeof evt.noExeCf != 'undefined');
  assert.equal(true, typeof evt.runtime != 'undefined');
  assert.equal(true, typeof evt.stage != 'undefined');

  if (!config.noExecuteCf) {
    assert.equal(true, typeof evt.iamRoleLambdaArn != 'undefined');
  }
};

describe('Test action: Project Create', function() {

  before(function(done) {
    process.chdir(os.tmpdir());
    done();
  });

  after(function(done) {
    done();
  });

  describe('Project Create', function() {
    it('should create a new project in temp directory', function(done) {

      this.timeout(0);

      let name    = ('testprj-' + uuid.v4()).replace(/-/g, '');
      let domain  = name + '.com';
      let event   = {
        name:               name,
        domain:             domain,
        notificationEmail:  config.notifyEmail,
        region:             config.region,
        noExeCf:            config.noExecuteCf,
      };

      serverless.actions.projectCreate(event)
          .then(function(evt) {

            // Validate Event
            validateEvent(evt);

            let projectJson = utils.readAndParseJsonSync(path.join(os.tmpdir(), name, 's-project.json'));
            let region = false;

            for (let i = 0; i < projectJson.stages.development.length; i++) {
              let stage = projectJson.stages[config.stage][i];
              if (stage.region === config.region) {
                region = stage.region;
              }
            }

            assert.isTrue(region !== false);
            done();
          })
          .catch(SError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});
