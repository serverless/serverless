module.exports = function(app) {

    // Application Routes
    var middleware = require('../app/controllers/middleware');
    var application = require('../app/controllers/application');
    var servant = require('../app/controllers/servant');

    // Servant
    app.get('/servant/callback', servant.servantConnectCallback);
    app.post('/servant/webhooks', servant.servantWebhooksCallback);

    // API
    app.get('/logout', application.logOut);
    app.get('/user_and_servants', middleware.checkSession, application.loadUserAndServants);

    // Ping URL – New Relic and other availability services
    app.head('/ping', function(req, res, next) {
        res.json('pinged!');
    });
    app.get('/ping', function(req, res, next) {
        res.json('pinged!');
    });

    // Application
    app.get('/', application.index);

};