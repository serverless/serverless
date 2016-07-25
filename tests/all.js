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
require('../lib/plugins/tracking/tests/tracking');

// AWS Plugins Tests
require('../lib/plugins/aws/tests');
require('../lib/plugins/aws/invoke/tests');
require('../lib/plugins/aws/remove/tests/all');
require('../lib/plugins/aws/deploy/tests/all');
require('../lib/plugins/aws/deploy/compile/functions/tests');
require('../lib/plugins/aws/deploy/compile/events/s3/tests');
require('../lib/plugins/aws/deploy/compile/events/schedule/tests');
require('../lib/plugins/aws/deploy/compile/events/apiGateway/tests/all');
require('../lib/plugins/aws/deploy/compile/events/sns/tests');
