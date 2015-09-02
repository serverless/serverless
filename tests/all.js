'use strict';

//TODO: doc on needing to set env vars
//TODO: must setup an env var file for unittest
require('./config');  //init config

describe('AllTests', function() {
  before(function(done) {
    this.timeout(0);  //dont timeout anything
    done();
  });

  after(function() {
  });

  //require tests vs inline so we can run sequentially
  // Require Tests ("new" must be last)
  require('./cli/tag');             //does not create AWS resources
  require('./cli/deploy_lambda');
  //require('./cli/deploy_api');
  require('./cli/install');
  require('./cli/env');
  require('./cli/new');
});