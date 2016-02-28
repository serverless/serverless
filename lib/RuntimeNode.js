'use strict';

const SError   = require('./Error'),
  RuntimeBase  = require('./RuntimeBase'),
  SCli         = require('./utils/cli'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

let SUtils;

class ServerlessRuntimeNode extends RuntimeBase {
  constructor(S) {
    super( S, 'nodejs' );

    SUtils = S.utils;
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

module.exports = ServerlessRuntimeNode;
