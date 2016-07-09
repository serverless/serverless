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
require('../lib/plugins/aws/tests');
require('./tests');
require('./tests/all');
require('./tests/all');
require('./compile/functions/tests');
require('./compile/events/s3/tests');
require('./compile/events/schedule/tests');
require('./compile/events/apiGateway/tests/all');
