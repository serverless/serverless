// Dependencies
var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    errorHandler = require('errorhandler'),
    methodOverride = require('method-override'),
    hostname = process.env.HOSTNAME || 'localhost',
    port = parseInt(process.env.PORT, 10) || 8080,
    publicDir = process.argv[2] || __dirname + '/public',
    env = process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Config
app.use(express.static(publicDir));
app.use(errorHandler({
    dumpExceptions: true,
    showStack: true
}));
app.set('views', __dirname + '/public');
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// Routes
app.get('/', function(req, res) {
    res.render('home/home');
});
app.get('/dashboard', function(req, res) {
    res.render('dashboard/dashboard');
});

// Start Server
console.log('****** JAWS Server Running: http://%s:%s', hostname, port);
app.listen(port, hostname);