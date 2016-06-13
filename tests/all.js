'use strict';

// Serverless Core Tests
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
require('../lib/plugins/invoke/tests/invoke');
require('../lib/plugins/remove/tests/remove');
require('../lib/plugins/awsDeploy/tests/all');
require('../lib/plugins/awsRemove/tests/all');
require('../lib/plugins/awsInvoke/tests/awsInvoke');
require('../lib/plugins/awsCompileFunctions/tests/awsCompileFunctions');
require('../lib/plugins/awsCompileS3Events/tests/awsCompileS3Events');
require('../lib/plugins/awsCompileScheduledEvents/tests/awsCompileScheduledEvents');
require('../lib/plugins/awsCompileApigEvents/tests/all');
