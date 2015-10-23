'use strict';

/**
 * JAWS CLI: Utilities
 */
require('shelljs/global');
let Promise       = require('bluebird'),
    rawDebug      = require('debug'),
    path          = require('path'),
    async         = require('async'),
    readdirp      = require('readdirp'),
    JawsError     = require('../jaws-error'),
    fs            = require('fs'),
    mkdirpAsync   = require('mkdirp-then'),
    shortid       = require('shortid'),
    expandHomeDir = require('expand-home-dir');

Promise.promisifyAll(fs);

/**
 * Find all lambda.awsm.json paths of given type
 *
 * @param startPath
 * @param type type lambda|endpoint
 * @returns {Promise.<Array>} list of full paths tho lambda.awsm.json's
 */
exports.findAllAwsmPathsOfType = function(startPath, type) {
  let _this = this,
      jawsJsonAttr;
  switch (type) {
    case 'lambda':
      jawsJsonAttr = 'lambda';
      break;
    case 'endpoint':
      jawsJsonAttr = 'apiGateway';
      break;
    default:
      return Promise.reject(new JawsError(`Invalid type ${type}`, JawsError.errorCodes.UNKNOWN));
      break;
  }

  return _this.readRecursively(startPath, '*lambda.awsm.json')
    .then(function(jsonPaths) {
      _this.jawsDebug('lambda.awsm.json paths found: ', jsonPaths);

      return new Promise(function(resolve, reject) {

        let jawsPathsOfType = [];

        // Check each file to ensure it is a lambda
        async.eachLimit(jsonPaths, 10, function(jsonPath, cb) {
            let lambdaJawsPath = path.join(startPath, jsonPath),
                json           = _this.readAndParseJsonSync(lambdaJawsPath);

            if (typeof json.cloudFormation[jawsJsonAttr] !== 'undefined') jawsPathsOfType.push(lambdaJawsPath);
            return cb();
          },

          function(error) {
            if (error) reject(error);

            _this.jawsDebug('lambda.awsm.json FULL paths found: ', jawsPathsOfType);
            let s = new Set(jawsPathsOfType);
            resolve(Array.from(s));
          });
      });
    });
};

/**
 * Given a list of paths to lambda dirs, will resolve to abs path (ex: ~,./).
 * If lambdaPaths[0] == 'all' will find all lambda paths
 * If lambdaPaths is empty or not set, will use lambda at cwd
 *
 * @param cwd
 * @param projectRootPath
 * @param lambdaPaths Array
 * @returns {Promise.<Array>} list of full paths to lambda.awsm.json files that are type lambda
 */
exports.resolveLambdaPaths = function(cwd, projectRootPath, lambdaPaths) {
  if (lambdaPaths[0].toLowerCase() == 'all') {
    this.jawsDebug('all lambda paths specified, searching..');
    return this.findAllLambdas(projectRootPath);
  } else {
    return this.getFullLambdaPaths(cwd, lambdaPaths);
  }
};

/**
 * Find project root path
 *
 * @param startDir
 * @returns {*}
 */
exports.findProjectRootPath = function(startDir) {
  let _this = this;

  // Check if startDir is root
  if (_this.fileExistsSync(path.join(startDir, 'jaws.json'))) {
    let jawsJsonInDir = require(path.join(startDir, 'jaws.json'));
    if (typeof jawsJsonInDir.name !== 'undefined') return path.resolve(startDir);
  }

  // Check up to 10 parent levels
  let previous     = './',
      projRootPath = false;

  for (let i = 0; i < 10; i++) {
    previous     = path.join(previous, '../');
    let fullPath = path.resolve(startDir, previous);

    if (_this.fileExistsSync(path.join(fullPath, 'jaws.json'))) {
      let jawsJson = require(path.join(fullPath, 'jaws.json'));
      if (typeof jawsJson.name !== 'undefined') {
        projRootPath = fullPath;
        break;
      }
    }
  }

  return projRootPath;
};

/**
 * Execute (Command)
 *
 * @param promise
 */

exports.execute = function(promise) {
  promise
    .catch(JawsError, function(e) {
      //console.error(e);
      throw e;
      process.exit(e.messageId);
    })
    .error(function(e) {
      console.error(e);
      process.exit(1);
    })
    .done();
};

/**
 * Read Recursively
 * @param path
 * @param filter
 * @returns {Promise}
 */
exports.readRecursively = function(path, filter) {
  return new Promise(function(resolve, reject) {

    let files = [];

    readdirp({
      root:       path,
      fileFilter: filter,
    })
      .on('data', function(entry) {
        files.push(entry.path);
      })
      .on('error', function(error) {
        reject(error);
      })
      .on('end', function() {
        resolve(files);
      });
  });
};

/**
 * Find all dirs that are lambdas
 *
 * @param projectRootPath
 * @returns {Promise.<Array>} list of full paths to lambda.awsm.json files that are type lambda
 */
exports.findAllLambdas = function(projectRootPath) {
  return this.findAllAwsmPathsOfType(projectRootPath, 'lambda');
};

/**
 * Find all dirs that are endpoints
 *
 * @param projectRootPath
 * @returns {Promise.<Array>} list of full paths to awsm.json files that are type endpoint
 */
exports.findAllEndpoints = function(projectRootPath) {
  return this.findAllAwsmPathsOfType(projectRootPath, 'endpoint');
};

/**
 * Finds all env let keys that are used by all lambdas in a given aws module
 *
 * @param projectRootPath
 * @param modName
 * @returns {Promise} list of ENV let key strings
 */
exports.findAllEnvletsForAwsm = function(projectRootPath, modName) {
  let _this = this;

  return this.findAllAwsmPathsOfType(path.join(projectRootPath, 'aws_modules', modName), 'lambda')
    .then(function(awsmJsonPaths) {
      let envletKeys = [];

      awsmJsonPaths.forEach(function(awsmJsonPath) {
        let awsmJson = _this.readAndParseJsonSync(awsmJsonPath);

        //TODO: change to es6 set...
        if (awsmJson.lambda && awsmJson.lambda.envlets) {
          awsmJson.lambda.envlets.forEach(function(envlet) {
            if (envletKeys.indexOf(envlet) == -1) {
              envletKeys.push(envlet);
            }
          });
        }
      });

      return envletKeys;
    });
};

/**
 * Find all awsm json paths underneath given dir
 *
 * @param startPath
 * @returns {Promise} list of full paths to awsm.json files
 */
exports.findAllAwsmJsons = function(startPath) {
  return this.readRecursively(startPath, '*awsm.json')
    .then(function(jsonPaths) {
      return jsonPaths.map(function(jsonPath) {
        return path.resolve(path.join(startPath, jsonPath));
      });
    });
};

/**
 *
 * @param baseDir typically CWD
 * @param lambdaPaths <Array> optional abs or rel (to baseDir) paths to lambda dirs. If ommitted returns lambda at baseDir
 * @returns {Promise.<Array>}
 */
exports.getFullLambdaPaths = function(baseDir, lambdaPaths) {
  let _this     = this,
      fullPaths = [];

  if (!lambdaPaths || lambdaPaths.length == 0) {  //getting lambda at CWD
    let awsmPath = path.join(process.cwd(), 'lambda.awsm.json');
    fullPaths.push(awsmPath);
  }

  for (let lambdaPath of lambdaPaths) {
    let awsmPath = '';

    lambdaPath = expandHomeDir(lambdaPath);

    if (lambdaPath.indexOf('/') == 0) {
      awsmPath = path.join(lambdaPath, 'lambda.awsm.json');
    } else {
      awsmPath = path.resolve(baseDir, lambdaPath, './lambda.awsm.json');
    }

    fullPaths.push(awsmPath);
  }

  fullPaths.forEach(p => {
    if (!_this.fileExistsSync(p)) {
      throw new JawsError(`Invalid lambda path ${p}`, JawsError.errorCodes.INVALID_RESOURCE_NAME);
    }
  });

  this.jawsDebug('got full lambda paths:', fullPaths);

  let s = new Set(fullPaths);

  return Promise.resolve(Array.from(s));
};

/**
 * Writes file and makes any parent dirs if necessary
 *
 * @param filePath
 * @param contents node Buffer
 * @returns {Promise}
 */
exports.writeFile = function(filePath, contents) {
  this.jawsDebug('Writing file:', filePath);

  if (contents === undefined) {
    contents = '';
  }

  return mkdirpAsync(path.dirname(filePath))
    .then(function() {
      return fs.writeFileAsync(filePath, contents);
    });
};

exports.generateShortId = function(maxLen) {
  return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
};

/**
 * Get Lambda Name
 * @param awsmJson
 * @returns {string}
 */

exports.getLambdaName = function(awsmJson) {
  return awsmJson.name;
};

/**
 * Generate JawsBucket Name
 * @param stage
 * @param region
 * @param projectDomain
 * @returns {string}
 */

exports.generateJawsBucketName = function(stage, region, projectDomain) {

  // Sanitize
  stage         = stage.trim().toLowerCase();
  region        = region.trim().replace(/-/g, '').toLowerCase();
  projectDomain = projectDomain.trim().toLowerCase();

  return `jaws.${stage}.${region}.${projectDomain}`;
};

/**
 * Gets all lambda functionName's
 *
 * @param projectRootPath
 * @returns {Promise} list of functionName's
 */
exports.getAllLambdaNames = function(projectRootPath) {
  let _this       = this,
      lambdaNames = [];

  return this.findAllLambdas(projectRootPath)
    .then(function(lambdaAwsmPaths) {
      lambdaAwsmPaths.forEach(function(ljp) {
        let awsm       = _this.readAndParseJsonSync(ljp),
            lambdaName = _this.getLambdaName(awsm);

        lambdaNames.push(lambdaName);
      });

      return lambdaNames;
    });
};

/**
 * Given list of project stages objects, extract given region
 *
 * @param projectJawsJson
 * @param stage
 * @param regionName
 * @returns {*} region object for stage
 */

exports.getProjRegionConfigForStage = function(projectJawsJson, stage, regionName) {
  let projectStageObj = projectJawsJson.stages[stage];

  let region = projectStageObj.filter(function(regionObj) {
    return regionObj.region == regionName;
  });

  if (!region || region.length == 0) {
    throw new JawsError(`Could not find region ${regionName}`, JawsError.errorCodes.UNKNOWN);
  }

  if (region.length > 1) {
    throw new JawsError(`Multiple regions named ${regionName}`, JawsError.errorCodes.UNKNOWN);
  }

  return region[0];
};

exports.dirExistsSync = function(path) {
  try {
    let stats = fs.lstatSync(path);
    return stats.isDirectory();
  }
  catch (e) {
    return false;
  }
};

exports.fileExistsSync = function(path) {
  try {
    let stats = fs.lstatSync(path);
    return stats.isFile();
  }
  catch (e) {
    return false;
  }
};

exports.readAndParseJsonSync = function(path) {
  return JSON.parse(fs.readFileSync(path));
};

exports.endsWith = function(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

exports.npmInstall = function(dir) {
  let cwd = process.cwd();

  process.chdir(dir);
  if (exec('npm install ', {silent: false}).code !== 0) {
    throw new JawsError(`Error executing NPM install on ${dir}`, JawsError.errorCodes.UNKNOWN);
  }

  process.chdir(cwd);
};

exports.generateResourcesCf = function(projRootPath, projName, projDomain, stage, region, notificationEmail) {

  let cfTemplate                                    = require('../templates/resources-cf');
  cfTemplate.Parameters.aaProjectName.Default       = projName;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [projName];
  cfTemplate.Parameters.aaProjectDomain.Default     = projDomain;
  cfTemplate.Parameters.aaStage.Default             = stage;
  cfTemplate.Parameters.aaDataModelStage.Default    = stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaNotficationEmail.Default = notificationEmail;
  cfTemplate.Description                           = projName + ' resources';

  return this.writeFile(
    path.join(projRootPath, 'cloudformation', stage, region, 'resources-cf.json'),
    JSON.stringify(cfTemplate, null, 2)
  );
};

/**
 * Write to console.log if process.env.DEBUG is true
 *
 * If we ever want to get more complicated with log levels we should use winston
 *
 * @param str
 */

let debuggerCache            = {};
exports.jawsDebugWithContext = function(context) {
  if (process.env.DEBUG) {
    context = `jaws:${context}`;

    if (!debuggerCache[context]) {
      debuggerCache[context] = rawDebug(context);
    }

    debuggerCache[context].apply(null, Array.prototype.slice.call(arguments, 1));
  }
};

exports.jawsDebug = function() {
  if (process.env.DEBUG) {
    let caller  = getCaller();
    let context = pathToContext(caller);
    let args    = Array.prototype.slice.call(arguments);
    args.unshift(context);
    this.jawsDebugWithContext.apply(this, args);
  }
};

function pathToContext(path) {
  // Match files under lib, tests, or bin so we only report the
  // relevant part of the file name as the context
  let pathRegex = /\/((lib|tests|bin)\/.*?)\.js$/i;
  let match     = pathRegex.exec(path);
  if (match.length >= 2) {
    return match[1].replace(/[\/\\]/g, '.');
  } else {
    return path;
  }
}

function getCaller() {
  let stack = getStack();

  // Remove unwanted function calls on stack -- ourselves and our caller
  stack.shift();
  stack.shift();

  // Now the top of the stack is the CallSite we want
  // See this for available methods:
  //     https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
  let path = stack[0].getFileName();
  return path;
}

function getStack() {
  // Save original Error.prepareStackTrace
  let origPrepareStackTrace = Error.prepareStackTrace;

  // Override with function that just returns `stack`
  Error.prepareStackTrace = function(_, stack) {
    return stack;
  };

  let err = new Error();

  // Get `err.stack`, which calls our new `Error.prepareStackTrace`
  let stack = err.stack;

  // Restore original `Error.prepareStackTrace`
  Error.prepareStackTrace = origPrepareStackTrace;

  // Remove ourselves from the stack
  stack.shift();

  return stack;
}