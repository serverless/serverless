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
  SError        = require('../Error'),
  SCli          = require('./cli'),
  dotenv        = require('dotenv'),
  fs            = require('fs'),
  mkdirpAsync   = require('mkdirp-then'),
  _             = require('lodash'),
  shortid       = require('shortid');

BbPromise.promisifyAll(fs);


/**
 * Get File Path
 */

module.exports.getFilePath = function(rootPath) {
  let args = _.toArray( arguments );
  args.unshift( rootPath );
  return path.join.apply( path, args );
};

/**
 * Find Project Path
 */

module.exports.findProjectPath = function(startDir) {

  let _this = this;

  // Helper function
  let isProjectDir = function(dir) {
    let jsonName = 's-project.json';

    if (_this.fileExistsSync(path.join(dir, jsonName))) {
      let projectJson = require(path.join(dir, jsonName));
      if (typeof projectJson.name !== 'undefined') {
        return true;
      }
    }
    return false;
  };

  // Check up to 10 parent levels
  let previous  = '.',
    projectPath = undefined,
    i = 10;

  while( i >= 0 ) {
    let fullPath = path.resolve(startDir, previous);

    if( isProjectDir( fullPath ) ){
      projectPath = fullPath;
      break;
    }

    previous = path.join(previous, '..');
    i--;
  }

  return projectPath;
};

/**
 * Get Bucket Region
 */

module.exports.getProjectBucketRegion = function(vars) {
  if (vars.projectBucketRegion) {
    return vars.projectBucketRegion;
  } else {
    return vars.projectBucket.split('.')[1];
  }
};

/**
 * Export Object
 * - Exports a class to an object
 */

exports.exportObject = function(data) {
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
  if (data.cPath)          path = path + '/' + data.cPath.trim();
  if (data.function)       path = path + '/' + data.function.trim();
  if (data.endpointPath)   path = path + '@' + data.endpointPath.trim();
  if (data.endpointMethod) path = path + '~' + data.endpointMethod.trim();
  return path;
};

/**
 * Parse sPath
 */

exports.parseSPath = function(sPath) {
  let pArray    = sPath.split('/');
  if (pArray.length < 1) {
    return { component: pArray[0] }
  } else {
    let parsed = {
      component: pArray[0],
      function:  pArray[1] ? pArray[pArray.length - 1].split('@')[0] : null,
      urlPath:   pArray[1] ? pArray[pArray.length - 1].split('@')[1] ? pArray[pArray.length - 1].split('@')[1].split('~')[0] : null : null,
      urlMethod: pArray[1] ? pArray[pArray.length - 1].split('@')[1] ? pArray[pArray.length - 1].split('@')[1].split('~')[1] : null : null,
      event:     pArray[1] ? pArray[pArray.length - 1].split('#')[1] : null
    };
    pArray.shift();
    pArray.pop();
    // Check for any cPath
    if (pArray.length) {
      parsed.cPath = pArray.join('/');
    }
    return parsed;
  }
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
 * Write File Async
 * - Writes file and makes any parent dirs if necessary
 * @param filePath
 * @param contents node Buffer
 * @returns {Promise}
 */

exports.writeFile = function(filePath, contents) {
  return new BbPromise(function(resolve, reject) {
    try {
      this.writeFileSync(filePath, contents);
    } catch(e) {
      reject(e);
    }
    resolve();
  });
};

/**
 * Write File Sync
 * - Writes file and makes any parent dirs if necessary
 */

exports.writeFileSync = function(filePath, contents) {

  this.sDebug(`Writing file: ${filePath}...`);

  if (contents === undefined) {
    contents = '';
  }

  try {
    mkdirp.sync(filePath);
  } catch(e) {
    throw new SError(`Could not create parent folders for: ${filePath}`);
  }

  return fs.writeFileSync(filePath, contents);
};

/**
 * Read File Sync
 * - Reads file from file system
 * - Auto-parses JSON and throws error if invalid JSON
 */

exports.readFileSync = function(filePath) {

  let contents;

  this.sDebug(`Reading file: ${filePath}...`);

  // Read file
  try {
    contents = fs.readFileSync(filePath);
  } catch(e) {
    throw new SError(`Error reading file ${filePath}`);
  }

  // Auto-parse JSON
  try {
    contents = JSON.parse(contents);
  } catch(e) {
    throw new SError(`Could not parse JSON in file: ${filePath}`);
  }

  return contents;
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
 *
 * This function is here only for purpose of running testsuite.
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

exports.isComponentNameValid = function(componentName) {
  return /^[\w-]{1,20}$/.test(componentName);
};

exports.isFunctionNameValid = function(functionName) {
  return /^[\w-]{1,20}$/.test(functionName);
};

exports.isPluginNameValid = function(pluginName) {
  return /^[\w-]+$/.test(pluginName);
};

exports.getModulePath = function(moduleName, componentName, projectRootPath) {
  return path.join(projectRootPath, componentName, moduleName);
};

exports.getModule = function(moduleName, componentName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getModulePath(moduleName, componentName, projectRootPath), 's-module.json')
  );
};

exports.getFunctionPath = function(functionName, componentName, projectRootPath) {
  return path.join(projectRootPath, componentName, functionName);
};

exports.doesComponentExist = function(componentName, projectRootPath) {
  return this.dirExistsSync(path.join(projectRootPath, componentName));
};

exports.doesFunctionExist = function(functionName, componentName, projectRootPath) {
  return this.dirExistsSync(this.getFunctionPath(functionName, componentName, projectRootPath));
};

/**
 * Populate
 * - Populates data: Project, Component or Function
 * - WARNING: strips nested class instances
 * - To change the template syntax add variableSyntax and/or templateSyntax
 *   properties with RegExp patterns to your s-project.json.
 *   Example: {"variableSyntax": "<%([\\s\\S]+?)%>"}
 */

exports.populate = function(meta, templates, data, stage, region) {

  // Validate required params
  if (!meta || !templates || !data || !stage || !region) throw new SError(`Missing required params: Serverless, project, stage, region`);

  // Validate: Check stage exists
  if (typeof stage != 'undefined' && !meta.stages[stage]) throw new SError(`Stage doesn't exist`);

  // Validate: Check region exists in stage
  if (typeof region != 'undefined' && !meta.stages[stage].regions[region]) throw new SError(`Region doesn't exist in provided stage`);

  // Sanitize: Remove nested properties.  DO NOT populate these.  Rely on calling those classes toObjectPopulated methods instead.
  if (data.components)  delete data.components;
  if (data.functions)   delete data.functions;

  let varTemplateSyntax      = /\${([\s\S]+?)}/g,
    templateTemplateSyntax = /\$\${([\s\S]+?)}/g;

  if (meta._S.getProject().variableSyntax) {
    varTemplateSyntax = RegExp(meta._S.getProject().variableSyntax,'g');
  }

  if (meta._S.getProject().templateSyntax) {
    templateTemplateSyntax = RegExp(meta._S.getProject().templateSyntax,'g');
  }

  // Populate templates
  traverse(data).forEach(function (val) {

    let t = this;

    // check if the current string is a template
    if (typeof val === 'string' && val.match(templateTemplateSyntax) != null) {

      let template = val.replace(templateTemplateSyntax, (match, varName) => varName.trim());

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

    // check if the current string is a variable
    if (typeof(val) === 'string' && !val.match(templateTemplateSyntax) && val.match(varTemplateSyntax)) {

      // get all ${variable} in the string
      val.match(varTemplateSyntax).forEach(function(variableSyntax) {

        let variableName = variableSyntax.replace(varTemplateSyntax, (match, varName) => varName.trim());
        let value;

        if (meta.stages[stage].regions[region].variables[variableName]) {
          value = meta.stages[stage].regions[region].variables[variableName]
        } else if (meta.stages[stage].variables[variableName]) {
          value = meta.stages[stage].variables[variableName];
        } else if (meta.variables[variableName]) {
          value = meta.variables[variableName];
        }

        // Reserved Variables
        if (variableName === 'name' && data.name) value = data.name;

        // Populate
        if (!value && !value !== "") {
          SCli.log('WARNING: This variable is not defined: ' + variableName);
        } else {
          val = replaceall(variableSyntax, value, val);
        }
      });

      // Replace
      t.update(val);
    }
  });

  return data;
};

exports.filterSPaths = function( collection, options ) {
  let paths = _.get( options, 'paths' );
  if( paths && (paths.length > 0) ) {
    collection = _.filter( collection, f =>
      _.some( paths, p =>
        f.getSPath().indexOf( p ) === 0
      )
    )
  }

  if( _.get( options, 'returnPaths' ) == true ){
    collection = _.map( collection, func => func.getSPath() );
  }

  return collection;
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


/**
 * Get ENV Files
 * - Get env files for a region or all regions, for a given stage
 * - Region param can be "all"
 */

exports.getEnvFiles = function(Serverless, region, stage) {
  let _this      = this,
    regionGets = [];

  if (region != 'all' || stage == 'local') {  //single region
    if (stage == 'local') {
      region = 'local';
    }

    regionGets.push(_this.getEnvFileAsMap(Serverless, region, stage)
      .then(envVars => {
        return {region: region, vars: envVars.map, raw: envVars.raw};
      }));

  } else {
    // All regions
    if (!Serverless.state.meta.get().stages[stage]) {
      return Promise.reject(new SError(`Invalid stage ${stage}`, SError.errorCodes.UNKNOWN));
    }
    Object.keys(Serverless.state.meta.get().stages[stage].regions).forEach(region => {
      regionGets.push(
        _this.getEnvFileAsMap(Serverless, region, stage)
          .then(envVars => {
            return {region: region, vars: envVars.map, raw: envVars.raw};
          }));
    });
  }

  return Promise.all(regionGets);
};

exports.getEnvFileAsMap = function(Serverless, region, stage) {

  let deferred;

  if (stage == 'local') {
    deferred = Promise.resolve(fs.readFileSync(Serverless.project.getFilePath( '.env' )));
  } else {
    let projectName  = Serverless.state.meta.get().variables.project,
      bucketName   = Serverless.state.meta.get().variables.projectBucket;

    SCli.log(`Getting ENV file from S3 bucket: ${bucketName}`);

    let aws = Serverless.getProvider('aws'),
      key = ['serverless', projectName, stage, region, 'envVars', '.env'].join('/');

    let params = {
      Bucket: bucketName,
      Key:    key
    };
    deferred = aws.request('S3', 'getObject', params, stage, region)
      .then(function(s3ObjData) {
        return (!s3ObjData.Body) ? '' : s3ObjData.Body;
      });
  }

  return deferred
    .then(function(envFileBuffer) {
      return {raw: envFileBuffer, map: dotenv.parse(envFileBuffer)};
    })
    .catch(function(err) {
      console.error(`Warning: trouble getting env for stage: ${stage} region: ${region}`, err);
      return {};
    });
};