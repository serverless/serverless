'use strict';

// Serverless Core Tests
require('./classes/Serverless');
require('./classes/PluginManager');
require('./classes/Utils');
require('./classes/Config');
require('./classes/Service');
require('./classes/YamlParser');
require('./classes/CLI');

// Core Plugins Tests
require('../lib/plugins/create/tests/create');
require('../lib/plugins/deploy/tests/deploy');
require('../lib/plugins/invoke/tests/invoke');
require('../lib/plugins/remove/tests/remove');
require('../lib/plugins/package/tests/all');

// AWS Plugins Tests
require('../lib/plugins/awsProvider/tests');
require('../lib/plugins/awsInvoke/tests');
require('../lib/plugins/awsRemove/tests/all');
require('../lib/plugins/awsDeploy/tests/all');
require('../lib/plugins/awsDeploy/compile/functions/tests');
require('../lib/plugins/awsDeploy/compile/events/s3/tests');
require('../lib/plugins/awsDeploy/compile/events/schedule/tests');
require('../lib/plugins/awsDeploy/compile/events/apiGateway/tests/all');
