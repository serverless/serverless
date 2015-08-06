var assert  = require("chai").assert,
    JAWSCli = require('../../lib/main');

describe('run', function () {
    before(function (done) {
        this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc
        done();
    });

    describe('users', function (ddone) {
        this.timeout(0);

        it('signup#successful', function (done) {
            this.timeout(0);

            JAWSCli.run(__dirname + '/../../../api/users/signup', function (err, result) {
                if (err) {
                    done(err);
                }
                else {
                    assert.isNotNull(result.jwt);
                    done();
                }
            });
        });

    });
});