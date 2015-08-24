'use strict';

var JAWS = require('../../lib/index.js'),
  JawsError = require('../../lib/jaws-error');

// Seed Test Data
var options = '--pro';

// Tests
describe('Test install command', function() {

  it('Without options', function(done) {
    this.timeout(0);

    JAWS.install()
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
