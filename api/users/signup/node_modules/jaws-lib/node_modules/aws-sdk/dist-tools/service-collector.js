var fs = require('fs');
var util = require('util');
var path = require('path');

var AWS = require('../');
var apis = require('../lib/api_loader');

var defaultServices = 'cloudwatch,cloudwatchlogs,cognitoidentity,cognitosync,devicefarm,dynamodb,dynamodbstreams,ec2,elastictranscoder,kinesis,lambda,mobileanalytics,machinelearning,opsworks,s3,sqs,sns,sts';
var sanitizeRegex = /[^a-zA-Z0-9,-]/;

var serviceClasses = {};
Object.keys(AWS).forEach(function(name) {
  if (AWS[name].serviceIdentifier) {
    serviceClasses[AWS[name].serviceIdentifier] = AWS[name];
  }
});

function getServiceHeader(service) {
  if (service === 'all') {
    return Object.keys(serviceClasses).map(function(name) {
      return getServiceHeader(name);
    }).join('\n');
  }

  if (!serviceClasses[service]) return null;
  var versions = serviceClasses[service].apiVersions.map(function(version) {
    return version.indexOf('*') >= 0 ? null : version;
  }).filter(function(c) { return c !== null; });

  var file = util.format(
    'AWS.apiLoader.services[\'%s\'] = {};\n' +
    'AWS.%s = AWS.Service.defineService(\'%s\', %s);\n',
    service, apis.serviceName(service), service, util.inspect(versions));
  var svcPath = path.join(__dirname, '..', 'lib', 'services', service + '.js');
  if (fs.existsSync(svcPath)) {
    file += 'require(\'./services/' + service + '\');\n';
  }

  return file;
}

function getService(service, version) {
  if (service === 'all') {
    return Object.keys(serviceClasses).map(function(name) {
      var out = serviceClasses[name].apiVersions.map(function(svcVersion) {
        if (svcVersion.indexOf('*') >= 0) return null;
        return getService(name, svcVersion);
      }).filter(function(c) { return c !== null; }).join('\n');

      return out;
    }).join('\n');
  }

  var svc, api;
  if (!serviceClasses[service]) {
    return null;
  }

  try {
    var ClassName = serviceClasses[service];
    svc = new ClassName({apiVersion: version, endpoint: 'localhost'});
    api = apis.load(service, svc.api.apiVersion);
  } catch (e) {
    return null;
  }

  var line = util.format(
    'AWS.apiLoader.services[\'%s\'][\'%s\'] = %s;',
    service, svc.api.apiVersion, JSON.stringify(api));

  return line;
}

function ServiceCollector(services) {
  var builtServices = {};

  function buildService(name, usingDefaultServices) {
    var match = name.match(/^(.+?)(?:-(.+?))?$/);
    var service = match[1], version = match[2] || 'latest';
    var contents = [];
    var lines, err;

    if (!builtServices[service]) {
      builtServices[service] = {};

      lines = getServiceHeader(service);
      if (lines === null) {
        if (!usingDefaultServices) {
          err = new Error('Invalid module: ' + service);
          err.name = 'InvalidModuleError';
          throw err;
        }
      } else {
        contents.push(lines);
      }
    }

    if (!builtServices[service][version]) {
      builtServices[service][version] = true;

      lines = getService(service, version);
      if (lines === null) {
        if (!usingDefaultServices) {
          err = new Error('Invalid module: ' + service + '-' + version);
          err.name = 'InvalidModuleError';
          throw err;
        }
      } else {
        contents.push(lines);
      }
    }

    return contents.join('\n');
  }

  var serviceCode = '';
  var usingDefaultServicesToggle = false;
  if (!services) {
    usingDefaultServicesToggle = true;
    services = defaultServices;
  }
  if (services.match(sanitizeRegex)) {
    throw new Error('Incorrectly formatted service names');
  }

  var invalidModules = [];
  var stsIncluded = false;
  services.split(',').sort().forEach(function(name) {
    if (name.match(/^sts\b/) || name === 'all') stsIncluded = true;
    try {
      serviceCode += buildService(name, usingDefaultServicesToggle) + '\n';
    } catch (e) {
      if (e.name === 'InvalidModuleError') invalidModules.push(name);
      else throw e;
    }
  });

  if (!stsIncluded) {
    serviceCode += buildService('sts') + '\n';
  }

  if (invalidModules.length > 0) {
    throw new Error('Missing modules: ' + invalidModules.join(', '));
  }

  return serviceCode;
}

module.exports = ServiceCollector;
