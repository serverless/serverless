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

    server = app.listen( port, function(){
      JawsCLI.log( "Jaws API Gateway simulator listening on http://localhost:" + port );
    });

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
          while( (cfPath.length > 0) && (cfPath[ cfPath.length - 1] == '/') ){
            cfPath = cfPath.substr( cfPath.length - 1 );
          }

          JawsCLI.log( "Route: " + cf.Method + " " + cfPath );

          var lambdaPathParts = ljp.split('/');
          lambdaPathParts.pop();

          var lambdaPath = lambdaPathParts.join('/');

          var handlerParts = awsmJson.lambda.cloudFormation.Handler.split('/').pop().split('.');
          var handler = require(lambdaPath + '/' + handlerParts[0] + '.js')[handlerParts[1]];

          app[ cf.Method.toLocaleLowerCase() ]( cfPath, function(req, res, next){
            JawsCLI.log("Serving: " + cf.Method + " " + cfPath);

            var result = new Promise(function(resolve, reject) {
              var lambdaName = utils.generateLambdaName(awsmJson);

              var event = {};
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

    });

  }) );
};
