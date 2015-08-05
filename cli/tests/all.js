describe('AllTests', function () {
    before(function (done) {
        this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc

        done();
    });

    after(function () {
    });

    //require('./wsclient/index');
    require('./controllers/weather');
});