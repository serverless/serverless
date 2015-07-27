var AWS = require('./core');

// Load browser API loader
AWS.apiLoader = function(svc, version) {
  return AWS.apiLoader.services[svc][version];
};

/**
 * @api private
 */
AWS.apiLoader.services = {};

// Load the DOMParser XML parser
AWS.XML.Parser = require('./xml/browser_parser');

// Load the XHR HttpClient
require('./http/xhr');

if (typeof window !== 'undefined') window.AWS = AWS;
if (typeof module !== 'undefined') module.exports = AWS;
