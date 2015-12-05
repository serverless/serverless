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

      let name = config.name  + '-' + uuid.v4();
      let event = {
        name:               name,
        domain:             config.domain,
        notificationEmail:  config.notifyEmail,
        stage:              config.stage,
        region:             config.region,
        noExeCf:            config.noExecuteCf,
      };

      serverless.actions.projectCreate(event)
        .then(function() {

          let jawsJson = utils.readAndParseJsonSync(path.join(os.tmpdir(), name, 's-project.json'));
          let region = false;

          for (let i = 0; i < jawsJson.stages[config.stage].length; i++) {
            let stage = jawsJson.stages[config.stage][i];
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
