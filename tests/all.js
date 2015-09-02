'use strict';

require('config');  //init config

describe('AllTests', function() {
  before(function(done) {
    this.timeout(0);  //dont timeout anything
    done();
  });

  after(function() {
  });

  //require tests vs inline so we can run sequentially
  // Require Tests ("new" must be last)
  require('./cli/tag');
  require('./cli/deploy_lambda');
  require('./cli/deploy_api');
  require('./cli/install');
  require('./cli/env');
  require('./cli/new');
});