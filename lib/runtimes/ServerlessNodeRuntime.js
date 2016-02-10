'use strict';

const SError   = require('../ServerlessError'),
  BaseRuntime  = require('./ServerlessBaseRuntime'),
  SCli         = require('../utils/cli'),
  SUtils       = require('../utils/index'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

class ServerlessNodeRuntime extends BaseRuntime {
  constructor(S) {
    super( S, 'nodejs' );
  }

  populateComponentFolder( componentPath ) {
    BbPromise.all([
      this.copyFileFromTemplate( [ 'index.js' ],     [ componentPath, 'lib', 'index.js' ] ),
      this.copyFileFromTemplate( [ 'package.json' ], [ componentPath, 'package.json' ] )
    ]);
  }

  populateFunctionFolder( fnRootPath, fnFullPath ) {
    this.copyFileFromTemplate( [ 'handler.js' ], [ fnFullPath, 'handler.js' ], function(template){
      return _.template(template)({fnRootPath: fnRootPath});
    } );
  }

  getFunctionRunActionName() {
    return 'functionRunLambdaNodeJs';
  }

  installDepedencies( dir ) {
    SCli.log('Installing "serverless-helpers" for this component via NPM...');
    SCli.log(`-----------------`);
    SUtils.npmInstall(this.S.getProject().getFilePath(dir));
    SCli.log(`-----------------`);
  }
}

module.exports = ServerlessNodeRuntime;
