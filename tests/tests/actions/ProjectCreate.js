'use strict';

/**
 * Test: Project Create Action
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    os        = require('os'),
    uuid      = require('node-uuid'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    shortid   = require('shortid'),
    JawsError = require('../../../lib/jaws-error'),
    config    = require('../../config');

// Instantiate JAWS
let Jaws = new JAWS({
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

      Jaws.actions.projectCreate(
        name,
        config.domain,
        config.stage,
        config.region,
        config.notifyEmail,
        'nodejs',
        config.noExecuteCf
        )
        .then(function() {
          let jawsJson = utils.readAndParseJsonSync(path.join(os.tmpdir(), name, 'jaws.json'));

          let region = false;

          for (let i = 0; i < jawsJson.stage[config.stage].length; i++) {
            let stage = jawsJson.stage[config.stage][i];
            if (stage.region === config.region) {
              region = stage.region;
            }
          }
          assert.isTrue(region !== false);
          done();
        })
        .catch(JawsError, function(e) {
          done(e);
        })
        .error(function(e) {
          done(e);
        });
    });
  });

  //it('Delete Cloudformation stack from new project', function(done) {
  //  this.timeout(0);
  //  let CF = new config.AWS.CloudFormation();
  //  CF.deleteStack({ StackName: config.stage + '-' + config.name }, function(err, data) {
  //    if (err) console.log(err, err.stack);
  //    done();
  //  });
  //});
});
