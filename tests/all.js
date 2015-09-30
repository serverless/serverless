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
  require('./cli/tag');
  require('./cli/env');
  require('./cli/module_create');
  require('./cli/run');

  /**
   * Tests below create AWS Resources
   */
   require('./cli/dash');
   require('./cli/deploy_lambda');
   require('./cli/deploy_resources');
   require('./cli/deploy_endpoint');
   require('./cli/new_stage_region');
   require('./cli/new_project');
});