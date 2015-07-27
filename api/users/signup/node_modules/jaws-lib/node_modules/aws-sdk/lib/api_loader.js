var fs = require('fs');
var path = require('path');

var apiRoot = path.join(__dirname, '..', 'apis');
var serviceMap = null;
var serviceIdentifiers = [];
var serviceNames = [];

function buildServiceMap() {
  if (serviceMap !== null) return;

  // load info file for API metadata
  serviceMap = require(path.join(apiRoot, 'metadata.json'));

  var prefixMap = {};
  Object.keys(serviceMap).forEach(function(identifier) {
    serviceMap[identifier].prefix = serviceMap[identifier].prefix || identifier;
    prefixMap[serviceMap[identifier].prefix] = identifier;
  });

  fs.readdirSync(apiRoot).forEach(function (file) {
    var match = file.match(/^(.+?)-(\d+-\d+-\d+)\.(normal|min)\.json$/);
    if (match) {
      var id = prefixMap[match[1]], version = match[2];
      if (serviceMap[id]) {
        serviceMap[id].versions = serviceMap[id].versions || [];
        if (serviceMap[id].versions.indexOf(version) < 0) {
          serviceMap[id].versions.push(version);
        }
      }
    }
  });

  Object.keys(serviceMap).forEach(function(identifier) {
    serviceMap[identifier].versions = serviceMap[identifier].versions.sort();
    serviceIdentifiers.push(identifier);
    serviceNames.push(serviceMap[identifier].name);
  });
}

function getServices() {
  buildServiceMap();
  return serviceIdentifiers;
}

function getServiceNames() {
  buildServiceMap();
  return serviceNames;
}

function serviceVersions(svc) {
  buildServiceMap();
  svc = serviceIdentifier(svc);
  return serviceMap[svc] ? serviceMap[svc].versions : null;
}

function serviceName(svc) {
  buildServiceMap();
  svc = serviceIdentifier(svc);
  return serviceMap[svc] ? serviceMap[svc].name : null;
}

function serviceFile(svc, version) {
  buildServiceMap();
  svc = serviceIdentifier(svc);
  if (!serviceMap[svc]) return null;

  var prefix = serviceMap[svc].prefix || svc;
  var filePath;
  ['min', 'api', 'normal'].some(function(testSuffix) {
    filePath = apiRoot + '/' + prefix.toLowerCase() + '-' + version + '.' +
           testSuffix + '.json';

    return fs.existsSync(filePath);
  });
  return filePath;
}

function paginatorsFile(svc, version) {
  buildServiceMap();
  svc = serviceIdentifier(svc);
  if (!serviceMap[svc]) return null;

  var prefix = serviceMap[svc].prefix || svc;
  return apiRoot + '/' + prefix + '-' + version + '.paginators.json';
}

function waitersFile(svc, version) {
  buildServiceMap();
  svc = serviceIdentifier(svc);
  if (!serviceMap[svc]) return null;

  var prefix = serviceMap[svc].prefix || svc;
  return apiRoot + '/' + prefix + '-' + version + '.waiters.json';
}

function load(svc, version) {
  buildServiceMap();
  svc = serviceIdentifier(svc);
  if (version === 'latest') version = null;
  version = version || serviceMap[svc].versions[serviceMap[svc].versions.length - 1];
  if (!serviceMap[svc]) return null;

  var api = require(serviceFile(svc, version));

  // Try to load paginators
  if (fs.existsSync(paginatorsFile(svc, version))) {
    var paginators = require(paginatorsFile(svc, version));
    api.paginators = paginators.pagination;
  }

  // Try to load waiters
  if (fs.existsSync(waitersFile(svc, version))) {
    var waiters = require(waitersFile(svc, version));
    api.waiters = waiters.waiters;
  }

  return api;
}

function serviceIdentifier(svc) {
  return svc.toLowerCase();
}

module.exports = {
  serviceVersions: serviceVersions,
  serviceName: serviceName,
  serviceIdentifier: serviceIdentifier,
  serviceFile: serviceFile,
  load: load
};

Object.defineProperty(module.exports, 'services', {
  enumerable: true, get: getServices
});

Object.defineProperty(module.exports, 'serviceNames', {
  enumerable: true, get: getServiceNames
});
