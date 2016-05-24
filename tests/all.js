'use strict';

process.env.DEBUG = '*';
require('./config');

require('./classes/Serverless');
require('./classes/PluginManager');
require('./classes/Utils');
require('./classes/Config');
require('./classes/Service');
require('./classes/YamlParser');
require('./classes/CLI');

require('./integration/Serverless');

require('../lib/plugins/create/tests/create');
require('../lib/plugins/deploy/tests/deploy');
