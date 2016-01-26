'use strict';

/**
 * Serverless: Utilities
 */

require('shelljs/global');
let BbPromise   = require('bluebird'),
  rawDebug      = require('debug'),
  path          = require('path'),
  async         = require('async'),
  traverse      = require('traverse'),
  readdirp      = require('readdirp'),
  replaceall    = require('replaceall'),
  SError        = require('../ServerlessError'),
  SCli          = require('./cli'),
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
    validPkgMgrs:  ['npm']
  },
  "python2.7": {
    defaultPkgMgr: 'pip',
    validPkgMgrs:  ['pip']
  }
};

/**
 * Export Class Data
 */

exports.exportClassData = function(data) {
  for (let prop in data) {

    // Remove private properties
    if (data.hasOwnProperty(prop) && prop.startsWith('_')) delete data[prop];

    // Remove methods
    if (typeof prop === 'function') delete data[prop];
  }

  return data;
};

/**
 * Build sPath
 */

exports.buildSPath = function(data) {
  let path                 = '';
  if (data.component)      path = path + data.component.trim();
  if (data.module)         path = path + '/' + data.module.trim();
  if (data.function)       path = path + '/' + data.function.trim();
  if (data.endpointPath)   path = path + '@' + data.endpointPath.trim();
  if (data.endpointMethod) path = path + '~' + data.endpointMethod.trim();
  return path;
};

/**
 * Parse sPath
 */

exports.parseSPath = function(path) {
  let parsed        = {};
  parsed.component  = path.split('/')[0] || null;
  parsed.module     = path.split('/')[1] || null;
  parsed.function   = path.split('/')[2] ? path.split('/')[2].split('@')[0] : null;
  parsed.urlPath    = path.split('@')[1] ? path.split('@')[1].split('~')[0] : null;
  parsed.urlMethod  = path.split('~')[1] || null;
  return parsed;
};

/**
 * Validate sPath
 */

exports.validateSPath = function(projectPath, sPath, type) {

  // Validate Syntax
  if (type.indexOf('component') > -1) {
    if (!sPath) throw new SError('Invalid path');
  } else if (type.indexOf('module') > -1) {
    let pathArray = sPath.split('/');
    if (!pathArray[0] || !pathArray[1] || pathArray[2] || sPath.indexOf('@') > -1 || sPath.indexOf('~') > -1) {
      throw new SError('Invalid path');
    }
  } else if (type.indexOf('function') > -1) {

    // Check path contents
    let pathArray = sPath.split('/');
    if (!pathArray[0] || !pathArray[1] || !pathArray[2]) {
      throw new SError('Invalid path');
    }

    // Validate Existence
    let parsed = this.parseSPath(sPath);
    if (!this.fileExistsSync(path.join(projectPath, parsed.component, parsed.module, parsed.function, 's-function.json'))) {
      throw new SError('Function path does not exist: ', sPath);
    }

  } else if (type.indexOf('endpoint') > -1) {
    let pathArray = sPath.split('/');
    if (!pathArray[0] || !pathArray[1] || !pathArray[2] || sPath.indexOf('@') == -1 || sPath.indexOf('~') == -1) {
      throw new SError('Invalid path');
    }
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

exports.getResources = function(projectData) {

  let _this      = this;
  let cfTemplate = JSON.parse(JSON.stringify(projectData.cloudFormation));

  // Helper function to aggregate resources
  function aggregate(cfData) {

    // If no cloudFormation in module, skip...
    if (!cfData.cloudFormation) return;

    // Merge Lambda Policy Statements
    if (cfData.cloudFormation.lambdaIamPolicyDocumentStatements &&
      cfData.cloudFormation.lambdaIamPolicyDocumentStatements.length > 0) {
      _this.sDebug('Merging in Lambda IAM Policy statements from: ' + cfData.name);

      cfData.cloudFormation.lambdaIamPolicyDocumentStatements.forEach(function (policyStmt) {
        cfTemplate.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
      });
    }

    // Merge Resources
    if (cfData.cloudFormation.resources) {

      let cfResourceKeys = Object.keys(cfData.cloudFormation.resources);

      if (cfResourceKeys.length > 0) {
        _this.sDebug('Merging in CF Resources from module: ' + cfData.name);
      }

      cfResourceKeys.forEach(function (resourceKey) {

        if (cfTemplate.Resources[resourceKey]) {
          _this.log(
            chalk.bgYellow.white(' WARN ') +
            chalk.magenta(` Resource key ${resourceKey} already defined in CF template. Overwriting...`)
          );
        }

        cfTemplate.Resources[resourceKey] = cfData.cloudFormation.resources[resourceKey];
      });
    }
  }

  // Aggregate Components CF
  for (let i = 0; i < Object.keys(projectData.components).length; i++) {
    let component = projectData.components[Object.keys(projectData.components)[i]];
    aggregate(component);


    // Aggregate Modules CF
    if (component.modules) {
      for (let j = 0; j < Object.keys(component.modules).length; j++) {
        aggregate(component.modules[Object.keys(component.modules)[j]]);
      }
    }
  }

  return cfTemplate;
};

/**
 * Read Recursively
 */

exports.readRecursively = function(path, filter) {
  return new BbPromise(function(resolve, reject) {

    let files = [];

    readdirp({
      root:       path,
      fileFilter: filter
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
 * Pip install using prefix strategy (not virtualenv), requires a modern `pip` version
 */
exports.pipPrefixInstall = function(requirements, dir) {
  if (exec(`pip install -t "${dir}" -r "${requirements}"`, { silent: false }).code !== 0) {
    throw new SError(`Error executing pip install on ${dir}`, SError.errorCodes.UNKNOWN);
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

exports.getModulePath = function(moduleName, componentName, projectRootPath) {
  return path.join(projectRootPath, componentName, moduleName);
};

exports.getModule = function(moduleName, componentName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getModulePath(moduleName, componentName, projectRootPath), 's-module.json')
  );
};

exports.getFunctionPath = function(functionName, moduleName, componentName, projectRootPath) {
  return path.join(projectRootPath, componentName, moduleName, functionName);
};

exports.getFunction = function(functionName, moduleName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getFunctionPath(functionName, moduleName, projectRootPath), 's-function.json')
  );
};

exports.doesComponentExist = function(componentName, projectRootPath) {
  return this.dirExistsSync(path.join(projectRootPath, componentName));
};

exports.doesModuleExist = function(moduleName, componentName, projectRootPath) {
  return this.dirExistsSync(this.getModulePath(moduleName, componentName, projectRootPath));
};

exports.doesFunctionExist = function(functionName, moduleName, componentName, projectRootPath) {
  return this.dirExistsSync(this.getFunctionPath(functionName, moduleName, componentName, projectRootPath));
};

/**
 * Populate
 * - Populates data: Project, Component, Module or Function
 * - WARNING: strips nested class instances
 */

exports.populate = function(meta, templates, data, stage, region) {

  // Validate required params
  if (!meta || !templates || !data || !stage || !region) throw new SError(`Missing required params: Serverless, project, stage, region`);

  // Validate: Check stage exists
  if (typeof stage != 'undefined' && !meta.stages[stage]) throw new SError(`Stage doesn't exist`);

  // Validate: Check region exists in stage
  if (typeof region != 'undefined' && !meta.stages[stage].regions[region]) throw new SError(`Region doesn't exist in provided stage`);

  // Sanitize: Remove nested properties.  DO NOT populate these.  Rely on calling those classes getPopulated methods instead.
  if (data.components)  delete data.components;
  if (data.modules)     delete data.modules;
  if (data.functions)   delete data.functions;
  if (data.endpoints)   delete data.endpoints;


  // Populate templates
  traverse(data).forEach(function (val) {

    let t = this;

    // check if the current string is a template $${...}
    if (typeof val === 'string' && val.match(/\$\${([^{}]*)}/g) != null) {

      let template = val.replace('$${', '').replace('}', '');

      // Module name syntax deprecated notice.
      if (template.indexOf('.') !== -1) {
        SCli.log('DEPRECATED: Including the module name $${moduleName.template} is no longer supported.  ' +
          'Instead, all templates are use only the template name $${template} whether they are located in s-templates.json files in the project root or module root.  ' +
          'Module level templates extend project level templates if there are duplicates.  You will need to change: ' + template);
      }

      if (!templates[template]) SCli.log('WARNING: the following template is requested but not defined: ' + template);

      // Replace
      if (templates[template]) t.update(templates[template]);
    }
  });

  // Populate variables
  traverse(data).forEach(function(val) {

    let t = this;

    // check if the current string is a variable ${...}
    if (typeof(val) === 'string' && val.match(/\${([^{}]*)}/g) != null && val.indexOf('$$') == -1) {

      // get all ${variable} in the string
      val.match(/\${([^{}]*)}/g).forEach(function(variableSyntax) {

        let variableName = variableSyntax.replace('${', '').replace('}', '');
        let value;

        if (meta.stages[stage].regions[region].variables[variableName]) {
          value = meta.stages[stage].regions[region].variables[variableName]
        } else if (meta.stages[stage].variables[variableName]) {
          value = meta.stages[stage].variables[variableName];
        } else if (meta.variables[variableName]) {
          value = meta.variables[variableName];
        }

        if (!value && !value !== "") throw new SError(`This variable is not defined: ${variableName}`);
        val = replaceall(variableSyntax, value, val);
      });

      // Replace
      t.update(val);
    }
  });

  return data;
};


function pathToContext(path) {
  // Match files under lib, tests, or bin so we only report the
  // Relevant part of the file name as the context
  let lPath = path.replace(/\\/g, '/');
  let pathRegex = /\/((lib|tests|bin)\/.*?)\.js$/i;
  let match     = pathRegex.exec(lPath);
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
