var Config           = require('../../../lib/config'),
    assert           = require("chai").assert,
    Q                = require('q'),
    dynamoDbUtils    = require('../../../lib/utilities/dynamodb'),
    JAWSCli          = require('../../lib/main'),
    usingLocalDynamo = (Config.aws.dynamoDbEndpoint.split(':').length > 1);

var User = require('../../../lib/models/user');

describe
('run', function () {
    before(function (done) {
        this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc

        if (!usingLocalDynamo) {
            done();
        }
        else {
            Q.all([
                dynamoDbUtils.createTableFromModelSchema(User.dynamoMetadata)
            ])
                .then(function () {
                    done();
                })
                .fail(function (err) {
                    done(err);
                });
        }
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