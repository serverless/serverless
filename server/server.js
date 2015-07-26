// Module Dependencies
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var session = require('cookie-session');
var cookieParser = require('cookie-parser');
var methodOverride = require('method-override');
var robots = require('robots.txt');

// Set Environment from ENV variable or default to development
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Set Port
var port = 8080;

// Set static files location
app.use(express.static(__dirname + '/public'));

// CookieParser should be above session
app.use(cookieParser());

// Express Cookie-Based Session
app.use(session({
    name: 'JAWSStack', // Change these for your own application
    secret: 'THEJAWSSTCK', // Change these for your own application
    secureProxy: false, // Set to true if you have an SSL Certificate
    cookie: {
        secure: false, // Secure is Recommeneded, However it requires an HTTPS enabled website (SSL Certificate)
        maxAge: 864000000 // 10 Days in miliseconds
    }
}));

// Set EJS as HTML as the template engine
app.set('views', './app/views');
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

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
require('./routes')(app);

// Start Application
app.listen(port);
console.log('****** The JAWS Stack ' + process.env.NODE_ENV + ' is now running on port ' + port + '  ******'); // shoutout to the user


// End