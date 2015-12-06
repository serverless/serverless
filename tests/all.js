'use strict';

require('./config');  //init config

describe('All Tests', function() {

  before(function(done) {
    this.timeout(0);  //dont timeout anything
    done();
  });

  after(function() {});

  //require('./tests/actions/TestPluginCustom');
  //require('./tests/actions/ProjectCreate');
  //require('./tests/actions/StageCreate');
  //require('./tests/actions/RegionCreate');
  //require('./tests/actions/ModuleCreate');
  //require('./tests/actions/FunctionDeploy');


  //require('./tests/actions/EnvList');  // TODO: Figure out how to write tests
  //require('./tests/actions/EnvGet');   // TODO: Figure out how to write tests
  //require('./tests/actions/EnvUnset'); // TODO: Figure out how to write tests
  //require('./tests/actions/EnvSet');   // TODO: Figure out how to write tests
  //require('./cli/dash');
});
