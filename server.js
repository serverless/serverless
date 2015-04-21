// New Relic – must be the first line of code
if (process.env.NODE_ENV && process.env.NODE_ENV === 'production') require('newrelic');

// Module Dependencies
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var session = require('cookie-session');
var fs = require('fs');
var cookieParser = require('cookie-parser');
var methodOverride = require('method-override');
var robots = require('robots.txt');

// Set Environment from ENV variable or default to development
var env = process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Load Local Environment Variables
if (env === 'development') {
    var dotenv = require('dotenv');
    dotenv.load();
}

// Load Config
var config = require('./config/config');

// Set Port
var port = process.env.PORT || config.app.port;

// set the static files location /public/img will be /img for users
app.use(express.static(__dirname + '/public'));

// CookieParser should be above session
app.use(cookieParser());

// Express Cookie-Based Session
app.use(session({
    name: 'iekoocLADENETALPRELIOBTNAVRES', // Change these for your own application
    secret: 'LADENETALPRELIOBTNAVRES', // Change these for your own application
    secureProxy: false, // Set to true if you have an SSL Certificate
    cookie: {
        secure: false, // Secure is Recommeneded, However it requires an HTTPS enabled website (SSL Certificate)
        maxAge: 864000000 // 10 Days in miliseconds
    }
}));

// Set Jade as the template engine
app.set('views', './app/views');
app.set('view engine', 'jade');

// Get req.body as JSON when receiving POST requests
app.use(bodyParser.json()); // parse application/json 
app.use(bodyParser.json({
    type: 'application/vnd.api+json'
})); // parse application/vnd.api+json as json
app.use(bodyParser.urlencoded({
    extended: true
})); // parse application/x-www-form-urlencoded

// Override with the X-HTTP-Method-Override header in the request. simulate DELETE/PUT
app.use(methodOverride('X-HTTP-Method-Override'));

// Robots.txt
app.use(robots(__dirname + '/robots.txt'))

// Routes
require('./app/routes')(app); // pass our application into our routes

/**
 * Lambda Set-Up
 * - Upload all Lambda functions on server start so they are ready to be called
 */
// var lambdaws = require('./app/other/aws_services').lambdaws;

// var lambda_functions_path = __dirname + '/app/lambda';
// fs.readdirSync(lambda_functions_path).forEach(function(file) {
//     var func = lambdaws.create(require(lambda_functions_path + '/' + file));
// });

// Start Application
app.listen(port);
console.log('****** Servant Boilerplate ' + env + ' is now running on port ' + port + '  ******'); // shoutout to the user
exports = module.exports = app; // expose app



// End