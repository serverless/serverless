'use strict';

var JawsError = require('../../lib/jaws-error'),
    JAWS = require('../../lib/index.js'),
    shortid = require('shortid'),
    fs = require('fs'),
    JAWS = require('../../lib/index.js');

describe('new', function() {
  var projDir = '/tmp/jaws-new' + shortid.generate();
  before(function(done) {
    this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc
    fs.mkdirSync(projDir);
    process.chdir(projDir);
    done();
  });

  describe('test new', function() {
    this.timeout(0);

    it('existing aws creds file', function(done) {
      this.timeout(0);

      var answers = {
        awsCliProfile: 'default',
        name: 'jaws-new-Ny17rwe2',
        stage: 'mystage',
        notificationEmail: 'afs@jaws.io',
      };

      JAWS.new(answers)
          .then(function() {
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
});
