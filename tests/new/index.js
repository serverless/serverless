'use strict';

var JawsError = require('../../lib/jaws-error'),
    shortid = require('shortid'),
    fs = require('fs');

var projDir = '/tmp/jaws-new' + shortid.generate();
fs.mkdirSync(projDir);
process.chdir(projDir);

var JAWS = require('../../lib/index.js');

describe('new', function() {
  before(function(done) {
    this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc
    done();
  });

  describe('test new', function() {
    this.timeout(0);

    it('existing aws creds file', function(done) {
      this.timeout(0);

      var answers = {
        awsCliProfile: 'default',
        name: 'jaws-new-test',
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
