'use strict';

/**
 * Serverless: Utilities
 */

require('shelljs/global');
let BbPromise       = require('bluebird'),
  rawDebug      = require('debug'),
  path          = require('path'),
  async         = require('async'),
  traverse      = require('traverse'),
  readdirp      = require('readdirp'),
  replaceall    = require('replaceall'),
  SError        = require('../ServerlessError'),
  ServerlessProject  = require('../ServerlessProject'),
  ServerlessMeta     = require('../ServerlessMeta'),
  fs            = require('fs'),
  mkdirpAsync   = require('mkdirp-then'),
  shortid       = require('shortid');

BbPromise.promisifyAll(fs);

/**
 * Supported Runtimes
 */

module.exports.supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs:  ['npm'],
  }
};

/**
 * Get Project Path
 * - Returns path string
 */

exports.getProjectPath = function(startDir) {

  let _this = this;

  // Check if startDir is root
  if (_this.fileExistsSync(path.join(startDir, 's-project.json'))) {

    let jawsJsonInDir = require(path.join(startDir, 's-project.json'));
    if (typeof jawsJsonInDir.name !== 'undefined') return path.resolve(startDir);
  }

  // Check up to 10 parent levels
  let previous     = './',
    projRootPath = false;

  for (let i = 0; i < 10; i++) {
    previous     = path.join(previous, '../');
    let fullPath = path.resolve(startDir, previous);

    if (_this.fileExistsSync(path.join(fullPath, 's-project.json'))) {
      let jawsJson = require(path.join(fullPath, 's-project.json'));
      if (typeof jawsJson.name !== 'undefined') {
        projRootPath = fullPath;
        break;
      }
    }
  }

  return projRootPath;
};

/**
 * GetResources
 * - Dynamically Create CloudFormation resources from s-project.json and s-module.json
 * - Returns Aggregated CloudFormation Template
 */

exports.getResources = function(populatedData) {

  let cfTemplate = JSON.parse(JSON.stringify(populatedData.cloudFormation));

  // Loop through modules and aggregate resources
  for (let i = 0; i < Object.keys(populatedData.modules).length; i++) {

    let moduleObj = populatedData.modules[Object.keys(populatedData.modules)[i]];

    // If no cloudFormation in module, skip...
    if (!moduleObj.cloudFormation) continue;

    // Merge Lambda Policy Statements
    if (moduleObj.cloudFormation.lambdaIamPolicyDocumentStatements &&
      moduleObj.cloudFormation.lambdaIamPolicyDocumentStatements.length > 0) {
      SCli.log('Merging in Lambda IAM Policy statements from module: ' + moduleObj.name);

      moduleObj.cloudFormation.lambdaIamPolicyDocumentStatements.forEach(function(policyStmt) {
        cfTemplate.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
      });
    }

    // Merge resources
    if (moduleObj.cloudFormation.resources) {

      let cfResourceKeys = Object.keys(moduleObj.cloudFormation.resources);

      if (cfResourceKeys.length > 0) {
        SCli.log('Merging in CF Resources from module: ' + moduleObj.name);
      }

      cfResourceKeys.forEach(function (resourceKey) {
        if (cfTemplate.Resources[resourceKey]) {
          SCli.log(
            chalk.bgYellow.white(' WARN ') +
            chalk.magenta(` Resource key ${resourceKey} already defined in CF template. Overwriting...`)
          );
        }

        cfTemplate.Resources[resourceKey] = moduleObj.cloudFormation.resources[resourceKey];
      });
    }
  }

  return cfTemplate;
};

/**
 * Execute (Command)
 */

exports.execute = function(promise) {
  promise
    .catch(SError, function(e) {
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
 */

exports.readRecursively = function(path, filter) {
  return new BbPromise(function(resolve, reject) {

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
 * Return Partial
 */

exports.returnPartial = function(string, symbol, number, defaultResponse) {
  if (string.indexOf(symbol) > -1) return string.split(symbol)[number];
  else return defaultResponse;
};

/**
 * Get Endpoints
 * - Return endpoint JSONs
 * - If no paths specified, finds all endpoints in baseDir
 * - Each endpoint must contain #, @ and ~ in path:  module/function#get@get-data~GET
 */

exports.getEndpoints = function(baseDir, endpointPaths) {

  let _this = this,
    allEndpointJsons = [];

  return BbPromise.try(function () {

      // Sanitize baseDir
      if ((baseDir).indexOf('/back') == -1) baseDir = path.join(baseDir, 'back');
      if ((baseDir).indexOf('/modules') == -1) baseDir = path.join(baseDir, 'modules');

      // If endpointPaths, validate and return them
      if (endpointPaths) {

        // Validate - ensure endpoint path contains #
        for (let i = 0; i < endpointPaths.length; i++) {
          let path = endpointPaths[i];

          // Ensure pointers are included
          if (path.indexOf('#') === -1 || path.indexOf('@') === -1 || path.indexOf('~') === -1) {
            throw new SError(`Endpoint path is missing '#', '@' or '~' : ${path}`,
              SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // If absolute path, trim to be relative
          if (path.indexOf('/back/modules') === -1) {
            path = path.split('back/modules/')[1];
          }
        }

        return endpointPaths;
      }

      // If no endpointPaths, get all functions in project and create their endpoint paths
      endpointPaths = [];
      return _this.readRecursively(baseDir, '*s-function.json')
        .then(function(functionFilePaths) {

          // If inside modules, grab path prefix
          let baseArray = baseDir.split(path.sep),
            pathPrefix;
          if (baseArray[baseArray.indexOf('modules') + 1]) {
            pathPrefix = (baseArray.splice(baseArray.indexOf('modules') + 1)).join(path.sep);
          }

          // We've used the basDir to locate functions.  Now, normalize baseDir
          if (baseDir.indexOf('modules/') > -1)  baseDir = path.join(baseDir.split('modules/')[0], 'modules/');
          if (baseDir.indexOf('modules\\') > -1) baseDir = path.join(baseDir.split('modules\\')[0], 'modules\\'); // Windows

          for (let i = 0; i < functionFilePaths.length; i++) {

            // Read JSON
            let filePath        = pathPrefix ? path.join(pathPrefix, functionFilePaths[i]) : functionFilePaths[i];
            let functionsObject = _this.readAndParseJsonSync(path.join(baseDir, filePath));
            functionsObject     = functionsObject.functions;

            // Create paths for each function in s-function.json
            for (let j = 0; j < Object.keys(functionsObject).length; j++ ) {

              let functionPath = filePath + '#' + Object.keys(functionsObject)[j];
              let funcObject = functionsObject[Object.keys(functionsObject)[j]];

              for (let k = 0; k < funcObject.endpoints.length; k++) {
                let endpointPath = functionPath + '@' + funcObject.endpoints[k].path + '~' + funcObject.endpoints[k].method;
                endpointPaths.push(endpointPath);
              }
            }
          }

          return endpointPaths;
        });
    })
    .then(function(paths) {

      // Sanitize Paths
      for (let i = 0; i < paths.length; i++) {

        paths[i] = paths[i].replace('s-function.json', '');
        paths[i] = paths[i].replace('/#', '#');
        paths[i] = paths[i].replace('\\#', '#');

        // Remove slashes after functionPath
        if (['/', '\\'].indexOf(paths[i].charAt(0)) !== -1) paths[i] = paths[i].substring(1, paths[i].length);
      }

      return paths;
    })
    .then(function(endpointPaths) {
      return new BbPromise(function(resolve, reject){

        // Loop through function paths and process
        async.eachLimit(endpointPaths, 10, function (pathEndpoint, cb) {

          let pathFunctionRelative  = null,
            nameFunction          = null,
            endpointUrlPath       = null,
            endpointMethod        = null;

          // Get Function Properties
          pathFunctionRelative  = _this.returnPartial(pathEndpoint, '@', 0, null);
          nameFunction          = _this.returnPartial(pathFunctionRelative, '#', 1, null);
          pathFunctionRelative  = _this.returnPartial(pathFunctionRelative, '#', 0, null);

          // Get Endpoint Properties
          endpointUrlPath  = _this.returnPartial(pathEndpoint, '@', 1, null);
          endpointMethod   = _this.returnPartial(pathEndpoint, '~', 1, null);
          endpointUrlPath  = _this.returnPartial(endpointUrlPath, '~', 0, null);

          // If endpointPath has s-function.json missing, add it
          pathEndpoint = pathEndpoint.replace('s-function.json', '');

          // Check function exists
          if (!_this.fileExistsSync(path.join(baseDir, pathFunctionRelative, 's-function.json'))) {
            throw new SError(
              `Invalid endpoint path ${pathEndpoint}`,
              SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // Get FunctionJSON
          let functionsObject;
          let endpointJson  = {};
          try {
            functionsObject = _this.readAndParseJsonSync(path.join(baseDir, pathFunctionRelative, 's-function.json'));
            let func        = functionsObject.functions[nameFunction];

            for (let i = 0; i < func.endpoints.length; i++) {
              let endpoint = func.endpoints[i];
              if (endpoint.path === endpointUrlPath && endpoint.method === endpointMethod) {
                endpointJson                        = endpoint;
                endpointJson.function               = func;
                endpointJson.function.name          = nameFunction;
                endpointJson.function.pathFunction  = path.join('back', 'modules', pathFunctionRelative);
              }
            }
          } catch(e) {
            console.log(e);
            throw new SError(`Invalid JSON in ${endpointUrlPath}`, SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // Get ModuleJSON
          let pathModule = path.join(baseDir, pathFunctionRelative.split(path.sep)[0], 's-module.json');
          let moduleJson;
          try {
            moduleJson = _this.readAndParseJsonSync(pathModule);
            moduleJson.pathModule = path.join('back', 'modules', pathFunctionRelative.split(path.sep)[0]);
          } catch(e) {
            throw new SError(`This endpoint has missing or invalid parent module JSON (s-module.json) ${endpointUrlPath} - ${pathModule}`,
              SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // Add attributes
          endpointJson.module = moduleJson;

          // Add to main array
          allEndpointJsons.push(endpointJson);

          // Callback
          return cb();

        }, function () {
          return resolve(allEndpointJsons);
        });
      });
    });
};

/**
 * getFunctionEnvVars
 * - Finds all Env Vars that are used by all Functions in a given Module
 */

exports.getFunctionEnvVars = function(projectRootPath, modName) {

  return this.getFunctions(path.join(projectRootPath, 'back', 'modules', modName), null)
    .then(function(functionJsons) {

      let envVars = [];
      functionJsons.forEach(function(functionJson) {

        if (functionJson.lambda && functionJson.lambda.envVar) {
          functionJson.lambda.envVar.forEach(function(envVar) {
            if (envVars.indexOf(envVar) == -1) {
              envVars.push(envVar);
            }
          });
        }
      });

      return envVars;
    });
};

/**
 * Write File
 * - Writes file and makes any parent dirs if necessary
 * @param filePath
 * @param contents node Buffer
 * @returns {Promise}
 */

exports.writeFile = function(filePath, contents) {
  this.sDebug('Writing file:', filePath);

  if (contents === undefined) {
    contents = '';
  }

  return mkdirpAsync(path.dirname(filePath))
    .then(function() {
      return fs.writeFileAsync(filePath, contents);
    });
};

/**
 * Generate Short ID
 * @param maxLen
 * @returns {string}
 */

exports.generateShortId = function(maxLen) {
  return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
};

/**
 * Generate Project Bucket Name
 */

exports.generateProjectBucketName = function(projectDomain, bucketRegion) {

  // Sanitize
  projectDomain = projectDomain.trim().toLowerCase();

  return `serverless.${bucketRegion}.${projectDomain}`;
};

/**
 * Given list of project stage objects, extract given region
 */

exports.getRegionConfig = function(projectMeta, stage, region) {

  if (!projectMeta.private.stages[stage].regions[region]) {
    throw new SError(`Could not find region ${region}`, SError.errorCodes.UNKNOWN);
  }

  return projectMeta.private.stages[stage].regions[region];
};

exports.dirExistsSync = function(path) {
  try {
    let stats = fs.statSync(path);
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

/**
 * NPM Install
 * - Programatically install NPM dependencies
 */

exports.npmInstall = function(dir) {
  process.chdir(dir);

  if (exec('npm install ', { silent: false }).code !== 0) {
    throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
  }

  process.chdir(process.cwd());
};

/**
 * Write to console.log if process.env.DEBUG is true
 * - If we ever want to get more complicated with log levels we should use winston
 */

let debuggerCache         = {};
exports.sDebugWithContext = function(context) {
  if (process.env.DEBUG) {
    context = `serverless:${context}`;
    if (!debuggerCache[context]) {
      debuggerCache[context] = rawDebug(context);
    }
    debuggerCache[context].apply(null, Array.prototype.slice.call(arguments, 1));
  }
};

exports.sDebug = function() {

  if (process.env.DEBUG) {
    let caller  = getCaller();
    let context = pathToContext(caller);
    let args    = Array.prototype.slice.call(arguments);
    args.unshift(context);
    this.sDebugWithContext.apply(this, args);
  }
};

exports.isStageNameValid = function(stageName) {
  return /^[a-zA-Z\d]+$/.test(stageName);
};

exports.isModuleNameValid = function(moduleName) {
  return /^[\w-]{1,20}$/.test(moduleName);
};

exports.isFunctionNameValid = function(functionName) {
  return /^[\w-]{1,20}$/.test(functionName);
};

exports.getModulePath = function(moduleName, projectRootPath) {
  return path.join(projectRootPath, 'back', 'modules', moduleName);
};

exports.getModule = function(moduleName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getModulePath(moduleName, projectRootPath), 's-module.json')
  );
};

exports.getFunctionPath = function(functionName, moduleName, projectRootPath) {
  return path.join(projectRootPath, 'back', 'modules', moduleName, functionName);
};

exports.getFunction = function(functionName, moduleName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getFunctionPath(functionName, moduleName, projectRootPath), 's-function.json')
  );
};

exports.doesComponentExist = function(componentName, projectRootPath) {
  return this.dirExistsSync(path.join(projectRootPath, componentName));
};

exports.doesModuleExist = function(moduleName, projectRootPath) {
  return this.dirExistsSync(this.getModulePath(moduleName, projectRootPath));
};

exports.doesFunctionExist = function(functionName, moduleName, projectRootPath) {
  return this.dirExistsSync(this.getFunctionPath(functionName, moduleName, projectRootPath));
};

/**
 * Populate
 */

exports.populate = function(S, populatedData, stage, region) {

  let _this = this;

  // Validate required params
  if (!S || !populatedData || !stage || !region) throw new SError(`Missing required params: Serverless, populatedData, stage, region`);

  // Get Meta & Project (to populate templates from)
  let meta    = new S.classes.Meta(S);
  let project = new S.classes.Project(S);

  // Validate stage exists
  if (typeof stage != 'undefined' && !meta.data.private.stages[stage]) throw new SError(`Stage doesn't exist`);

  // Validate region exists in stage
  if (typeof region != 'undefined' && !meta.data.private.stages[stage].regions[region]) throw new SError(`Region doesn't exist in provided stage`);

  // Combine all templates found in project
  let templates = {};
  for (let i = 0; i < Object.keys(project.data.modules).length; i++) {
    let module = Object.keys(project.data.modules)[i];
    templates[module] = project.data.modules[module].templates;
  }

  // Populate templates
  traverse(populatedData).forEach(function(val) {

    let t = this;

    // check if the current string is a template $${...}
    if (typeof val === 'string' && val.match(/\$\${([^{}]*)}/g) != null) {

      let template       = val.replace('$${', '').replace('}', '');
      let templateModule = template.slice(0, template.indexOf(".")); // assumes template path is valid format
      let templateName   = template.slice(template.indexOf(".") + 1, template.length); // assumes template path is valid format

      // Check module and template key exist
      if (!templates[templateModule])throw new SError(`This module does not exist: ${templateModule}`);
      if (!templates[templateModule][templateName] && templates[templateModule][templateName] !== "")throw new SError(`Missing template in module: ${templateName} in ${templateModule}`);

      // Replace
      t.update(templates[templateModule][templateName]);

    }
  });

  // Populate variables
  traverse(populatedData).forEach(function(val) {

    let t = this;

    // check if the current string is a variable ${...}
    if (typeof(val) === 'string' && val.match(/\${([^{}]*)}/g) != null) {

      // get all ${variable} in the string
      val.match(/\${([^{}]*)}/g).forEach(function(variableSyntax) {

        let variableName = variableSyntax.replace('${', '').replace('}', '');
        let value;

        if (meta.data.private.stages[stage].regions[region].variables[variableName]) {
          value = meta.data.private.stages[stage].regions[region].variables[variableName]
        } else if (meta.data.private.stages[stage].variables[variableName]) {
          value = meta.data.private.stages[stage].variables[variableName];
        } else if (meta.data.private.variables[variableName]) {
          value = meta.data.private.variables[variableName];
        }

        if (!value && !value !== "") throw new SError(`This variable is not defined: ${variableName}`);
        val = replaceall(variableSyntax, value, val);
      });

      // Replace
      t.update(val);
    }
  });

  return populatedData;
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

/**
 * Persistent Request
 * - AWS often gives a 429 error (Too Many Requests)
 * - This is how we get around that
 */

exports.persistentRequest = function(f) {

  return new BbPromise(function(resolve, reject){
    let doCall = function(){
      f()
        .then(resolve)
        .catch(function(error) {

          if( error.statusCode == 429 ) {
            SUtils.sDebug("'Too many requests' received, sleeping 5 seconds");
            setTimeout( doCall, 5000 );
          } else
            reject( error );
        });
    };
    return doCall();
  });
};
