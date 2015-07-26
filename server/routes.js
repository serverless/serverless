module.exports = function(app) {

    var application = require('./application');

    // Session Routes
    app.get('/signup', application.signIn);
    app.get('/signin', application.signIn);
    app.get('/signout', application.signOut);

    // Application
    app.get('/', application.render);

};