'use strict';

// Serverless Core Tests
require('../lib/Serverless.test');
require('../lib/classes/PluginManager.test');
require('../lib/classes/Utils.test');
require('../lib/classes/Config.test');
require('../lib/classes/Service.test');
require('../lib/classes/Variables.test');
require('../lib/classes/YamlParser.test');
require('../lib/classes/CLI.test');

// Core Plugins Tests
require('../lib/plugins/create/tests/create');
require('../lib/plugins/install/tests/install');
require('../lib/plugins/deploy/tests/deploy');
require('../lib/plugins/info/tests/info');
require('../lib/plugins/invoke/tests/invoke');
require('../lib/plugins/logs/tests/logs');
require('../lib/plugins/remove/tests/remove');
require('../lib/plugins/package/tests/all');
require('../lib/plugins/slstats/tests/slstats');

// AWS Plugins Tests
require('../lib/plugins/aws/provider/awsProvider.test');
require('../lib/plugins/aws/tests/validate');
require('../lib/plugins/aws/tests/monitorStack');
require('../lib/plugins/aws/tests/setBucketName');
require('../lib/plugins/aws/tests/findAndGroupDeployments');
require('../lib/plugins/aws/tests/getS3ObjectsFromStacks');
require('../lib/plugins/aws/info/tests');
require('../lib/plugins/aws/invoke/tests');
require('../lib/plugins/aws/logs/tests');
require('../lib/plugins/aws/remove/tests/all');
require('../lib/plugins/aws/deploy/tests/all');
require('../lib/plugins/aws/deploy/compile/functions/tests');
require('../lib/plugins/aws/deploy/compile/events/s3/tests');
require('../lib/plugins/aws/deploy/compile/events/schedule/tests');
require('../lib/plugins/aws/deploy/compile/events/apiGateway/tests/all');
require('../lib/plugins/aws/deploy/compile/events/sns/tests');
require('../lib/plugins/aws/deploy/compile/events/stream/tests');
require('../lib/plugins/aws/deployFunction/tests/index');
require('../lib/plugins/aws/deployList/tests/index');

// Other Tests
require('./utils/tests');
