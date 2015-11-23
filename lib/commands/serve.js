'use strict';

/**
 * JAWS Command: serve
 */

var JawsCLI = require('../utils/cli');
var Promise = require('bluebird');
var utils = require('../utils');
var path = require('path');
var context = require('../utils/context');
var express = require('express');
var bodyParser = require('body-parser');

/**
 *
 * @param {Jaws} JAWS
 */

module.exports.run = function(JAWS, init, prefix, port) {
  var app = express();
  var server;
  var rootPath = path.join(JAWS._meta.projectRootPath, 'aws_modules');

  if( !port ){
    port = 1465;
  }

  if( !prefix ){
    prefix = "";
  }

  if( (prefix.length > 0) && (prefix[prefix.length-1] != '/') ) {
    prefix = prefix + "/";
  }

  return( Promise.try(function(){
    if( init ){
      var handler = require(init);
      return( handler( JAWS, app ) );
    }
  }).then(function(){
    app.get( '/__quit', function(req, res, next){
      JawsCLI.log('Quit request received, quitting.');
      res.send({ok: true});
      server.close();
    });

    app.use( function(req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      next();
    });

    app.use(bodyParser.json());

    utils.findAllLambdas(rootPath).then(function(lambdaPaths){
      lambdaPaths.forEach(function(ljp) {
        var awsmJson = require(ljp);

        if( awsmJson.lambda.cloudFormation.Runtime == 'nodejs' ) {
          var cf = awsmJson.apiGateway.cloudFormation;

          var cfPath = prefix + cf.Path;

          if( cfPath[ 0 ] != '/' ) {
            cfPath = "/" + cfPath;
          }

          // In worst case we have two slashes at the end (one from prefix, one from "/" lambda mount point)
          while( (cfPath.length > 1) && (cfPath[ cfPath.length - 1 ] == '/') ){
            cfPath = cfPath.substr( cfPath.length - 1 );
          }

          var cfPathParts = cfPath.split( '/' );
          cfPathParts = cfPathParts.map(function(part){
            if( part.length > 0 ) {
              if( (part[ 0 ] == '{') && (part[ part.length - 1 ] == '}') ) {
                return( ":" + part.substr( 1, part.length - 2 ) );
              }
            }
            return( part );
          });

          JawsCLI.log( "Route: " + cf.Method + " " + cfPath );

          var lambdaPathParts = ljp.split('/');
          lambdaPathParts.pop();

          var lambdaPath = lambdaPathParts.join('/');

          var handlerParts = awsmJson.lambda.cloudFormation.Handler.split('/').pop().split('.');
          var handler;
          var handlerPath = lambdaPath + '/' + handlerParts[0] + '.js';
          try {
            handler = require( handlerPath )[handlerParts[1]];
          } catch( e ) {
            JawsCLI.log( "Unable to load " + handlerPath + ": " + e );
            throw e ;
          }

          app[ cf.Method.toLocaleLowerCase() ]( cfPathParts.join('/'), function(req, res, next){
            JawsCLI.log("Serving: " + cf.Method + " " + cfPath);

            var result = new Promise(function(resolve, reject) {
              var lambdaName = utils.generateLambdaName(awsmJson);

              var event = {};
              var prop;

              for( prop in req.body ) {
                if( req.body.hasOwnProperty( prop ) ){
                  event[ prop ] = req.body.prop;
                }
              }

              for( prop in req.params ) {
                if( req.params.hasOwnProperty( prop ) ){
                  event[ prop ] = req.params[ prop ];
                }
              }

              handler(event, context(lambdaName, function(err, result) {
                if (err) {
                  JawsCLI.log(err);
                  return reject(err);
                }
                resolve(result);
              }));
            });

            result.then(function(r){
              res.send(r);
            }, function(err){
              JawsCLI.log(err);
              res.status(500).send(err);
            });
          } );
        }
      });

      app.use( function(req, res, next){
        res.header( 'Access-Control-Allow-Methods', 'GET,PUT,HEAD,POST,DELETE,OPTIONS' );
        res.header( 'Access-Control-Allow-Headers', 'Authorization,Content-Type,x-amz-date,x-amz-security-token' );

        if( req.method != 'OPTIONS' ) {
          next()
        } else {
          res.status(200).end()
        }
      });

      server = app.listen( port, function(){
        JawsCLI.log( "Jaws API Gateway simulator listening on http://localhost:" + port );
      });

    })
    .catch(function(err){
      JawsCLI.log("FAIL:", err);
    });

  }) );
};
