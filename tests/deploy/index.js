var assert = require('chai').assert,
    JAWS = require('../../lib/main');

describe('deploy', function() {
  before(function(done) {
    this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc
    done();
  });

  describe('test env', function(ddone) {
    this.timeout(0);

    it('successful', function(done) {
      this.timeout(0);

      JAWS.deploy('test', __dirname + '/../../../api/users/signup')
          .then(function(functionArns) {
            assert.isTrue(-1 !== functionArns[0].indexOf('test_api_users_signup'));
            done();
          })
          .fail(function(err) {
            console.error(err, err.stack);
            done(err);
          });
    });

  });
});
