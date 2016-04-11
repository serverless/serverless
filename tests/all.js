'use strict';
process.env.DEBUG = '*';
require('./config');  // Init config

describe('All Tests', function() {
  this.timeout(0);  // Don't timeout anything
  before(function() {});
  after(function() {});

  require('./tests/classes/Project');
  require('./tests/classes/ProviderAws');
  require('./tests/classes/Function');
  require('./tests/classes/Endpoint');
  require('./tests/classes/Stage');
  require('./tests/classes/Region');
  require('./tests/actions/TestPluginCustom');
  require('./tests/actions/TestDefaultActionHook');
  require('./tests/actions/StageCreate');
  require('./tests/actions/RegionCreate');
  require('./tests/actions/FunctionCreate');
  require('./tests/actions/ResourcesDeploy');
  require('./tests/actions/FunctionRun');
  require('./tests/actions/FunctionLogs');
  require('./tests/actions/FunctionDeploy');
  require('./tests/actions/EndpointDeploy');
  require('./tests/actions/EventDeploy');
  require('./tests/actions/ProjectInit');
  require('./tests/actions/ProjectInstall');
  require('./tests/actions/ResourcesDiff');
  require('./tests/actions/PluginCreate');
  require('./tests/actions/FunctionRollback');
  require('./tests/actions/projectLifeCycle.js');
});
