'use strict';

process.env.DEBUG = '*';
require('./config');

require('./tests/classes/Serverless');
require('./tests/classes/PluginManager');
require('./tests/classes/Utils');
require('./tests/classes/Config');
require('./tests/classes/Service');
require('./tests/classes/YamlParser');
