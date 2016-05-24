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
