'use strict';

require('./config');  //init config

describe('All Tests', function() {

  before(function(done) {
    this.timeout(0);  //dont timeout anything
    done();
  });

  after(function() {
  });

  //require tests vs inline so we can run sequentially
  //require('./tests/TestPluginCustom');
  //require('./cli/tag');
  //require('./cli/env');
  //require('./cli/module_create');
  //require('./cli/run');

  /**
   * Tests below create AWS Resources
   */

  require('./tests/actions/ProjectCreate');
  require('./tests/actions/StageCreate');
  //require('./tests/actions/RegionCreate');
  //require('./tests/actions/VersionLambda');
  //require('./tests/actions/ModuleCreate');
  //require('./tests/actions/FunctionDeploy');
  //require('./tests/actions/EnvList');
  //require('./tests/actions/EnvGet');
  //require('./tests/actions/EnvUnset');
  //require('./tests/actions/EnvSet');
  //require('./cli/dash');
  //require('./cli/deploy_lambda');
  //require('./cli/deploy_resources');
  //require('./cli/deploy_endpoint');
});
