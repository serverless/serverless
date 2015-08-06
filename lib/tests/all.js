describe('AllTests', function () {
    before(function (done) {
        this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc
        done();
    });

    after(function () {
    });

    //require tests vs inline so we can run sequentially which gives us chance to prepare dbs before each test
    //require('./models/user'); //TODO
});