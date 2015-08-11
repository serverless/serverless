var Config            = require('../../lib/config'),
    DynamoDbLocal     = require('dynamodb-local'),
    dynamoEntptPieces = Config.aws.dynamoDbEndpoint.split(':'),
    dynamoLocalPort   = dynamoEntptPieces[dynamoEntptPieces.length - 1];

describe('AllTests', function () {
    before(function (done) {
        this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc

        if (dynamoLocalPort) {
            DynamoDbLocal.launch(dynamoLocalPort, null, ['-sharedDb'])
                .then(function () {
                    done();
                })
                .catch(function (err) {
                    console.log("Error starting local dynamo", err);
                    done(err);
                });
        }
        else {
            done();
        }
    });

    after(function () {
        if (dynamoLocalPort) DynamoDbLocal.stop(dynamoLocalPort);
    });

    //require tests vs inline so we can run sequentially which gives us chance to prepare dbs before each test
    require('./run');
    require('./deploy');
});