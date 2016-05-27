'use strict';

process.env.DEBUG = '*';
require('./config');

// Serverless Core
require('./classes/Serverless');
require('./classes/PluginManager');
require('./classes/Utils');
require('./classes/Config');
require('./classes/Service');
require('./classes/YamlParser');
require('./classes/CLI');

// Integration Tests
require('./integration/Serverless');

// Core Plugins Tests
require('../lib/plugins/create/tests/create');
require('../lib/plugins/deploy/tests/deploy');
require('../lib/plugins/awsResourcesDeploy/tests/awsResourcesDeploy');
require('../lib/plugins/awsCompileFunctionsToResources/tests/awsCompileFunctionsToResources');
