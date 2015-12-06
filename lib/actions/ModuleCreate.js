'use strict';

/**
 * Action: ModuleCreate
 * - takes module and function names
 * - validates that module doesn't already exist
 * - generates function sturcture based on runtime
 * - generates module structure
 *
 * Event Properties:
 * - module:    (String) Name of your new module
 * - function:  (String) Name of your first function in your new module
 */

const SPlugin  = require('../ServerlessPlugin'),
    SError     = require('../ServerlessError'),
    SCli       = require('../utils/cli'),
    SUtils     = require('../utils'),
    BbPromise  = require('bluebird'),
    path       = require('path'),
    wrench     = require('wrench');

let fs = require('fs');
BbPromise.promisifyAll(fs);

const supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs:  ['npm'],
  },
};

/**
 * ModuleCreate Class
 */

class ModuleCreate extends SPlugin {

  constructor(S, config) {
    super(S, config);
    this._templatesDir   = path.join(__dirname, '..', 'templates');
    this.evt = {};
  }

  static getName() {
    return 'serverless.core.' + ModuleCreate.name;
  }

  registerActions() {
    this.S.addAction(this.moduleCreate.bind(this), {
      handler:       'moduleCreate',
      description:   `Creates scaffolding for a new serverless module.
usage: serverless module create`,
      context:       'module',
      contextAction: 'create',
      options:       [
        {
          option:      'module',
          shortcut:    'm',
          description: 'The name of your new module'
        },
        {
          option:      'function',
          shortcut:    'f',
          description: 'The name of your first function for your new module'
        },
        {
          option:      'runtime',
          shortcut:    'r',
          description: 'Optional - Runtime of your new module. Default: nodejs'
        },
        {
          option:      'lambda',
          shortcut:    'l',
          description: 'Optional - if true, will create lambda only module. Default: will create both lambda & endpoint'
        },
        {
          option:      'endpoint',
          shortcut:    'e',
          description: 'Optional - if true, will create endpoint only module. Default: will create both lambda & endpoint'
        },
        {
          option:      'package-manager',
          shortcut:    'p',
          description: 'Optional - package manager for your chosen runtime. Default: npm for nodejs'
        },
        {
          option:      'nonInteractive',
          shortcut:    'ni',
          description: 'Optional - Turn off CLI interactivity if true. Default: false'
        },

      ],
    });

    return BbPromise.resolve();
  };


  /**
   * Action
   */
  
  moduleCreate(evt) {
    let _this = this;

    if(evt) {
      _this.evt = evt;
      _this.S._interactive = false;
    }
    
    // If CLI, parse options
    if (_this.S.cli) {
      _this.evt = this.S.cli.options;

      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }

    return _this.S.validateProject()
        .bind(_this)
        .then(_this._promptModuleFunction)
        .then(_this._validateAndPrepare)
        .then(_this._createModuleSkeleton)
        .then(_this._installFunctionDependencies)
        .then(function() {
          SCli.log('Successfully created ' + _this.evt.module + '/' + _this.evt.function);

          // Return Event
          return _this.evt;
        });
  };

  /**
   * Prompt module & function if they're missing
   */
  
  _promptModuleFunction(){
    let _this = this,
        overrides = {};

    if (!_this.S._interactive) return BbPromise.resolve();
    
    ['module', 'function'].forEach(memberVarKey => {
      overrides[memberVarKey] = _this['evt'][memberVarKey];
    });

    let prompts = {
      properties: {
        module:              {
          description: 'Enter a name for your new module: '.yellow,
          message:     'Module name is required.',
          required:    true,
        },
        function:            {
          description: 'Enter a function name for your new module: '.yellow,
          message:     'Function name is required',
          required:    true,
        },
      }
    };
    
    return _this.promptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.module = answers.module;
          _this.evt.function = answers.function;
        });
  };
  
  /**
   * Validate and prepare data before creating module
   */

  _validateAndPrepare() {
    // non interactive validation
    if (!this.S._interactive) {
      if (!this.evt.module || !this.evt.function) {
        return BbPromise.reject(new SError('Missing module or/and function names'));
      }
    }

    if (!this.evt.lambda && !this.evt.endpoint) { //default is to create both
      this.evt.lambda = true;
      this.evt.endpoint   = true;
    }
    
    // Add default runtime
    if (!this.evt.runtime) {
      this.evt.runtime = 'nodejs';
    }
    
    // add default package manager
    if (!this.evt.pkgMgr){
      this.evt.pkgMgr = supportedRuntimes[this.evt.runtime].defaultPkgMgr;
    }

    if (!supportedRuntimes[this.evt.runtime]) {
      return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
    }

    if (supportedRuntimes[this.evt.runtime].validPkgMgrs.indexOf(this.evt.pkgMgr) == -1) {
      return BbPromise.reject(new SError('Unsupported package manger "' + this.evt.pkgMgr + '"', SError.errorCodes.UNKNOWN));
    }

    // Sanitize module
    this.evt.module = this.evt.module.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);

    // Sanitize function
    this.evt.function = this.evt.function.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);
    
    // If module already exists, throw error
    let modulePath = path.join(this.S._projectRootPath, 'back', 'modules', this.evt.module);
    if (SUtils.dirExistsSync(modulePath)) {
      return BbPromise.reject(new SError(
          'module ' + this.evt.module + ' already exists',
          SError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    return BbPromise.resolve();
  };

  /**
   * Create Module Skeleton
   */

  _createModuleSkeleton() {

    let _this                = this,
        writeDeferred        = [],
        moduleJsonTemplate   = _this._generateModuleJson(),
        functionJsonTemplate = _this._generateFunctionJson(),
        packageJsonTemplate  = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'nodejs', 'package.json')),
        handlerJs            = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'handler.js')),
        libJs                = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'index.js'));

    // Save Paths
    _this.evt.modulePath     = path.join(this.S._projectRootPath, 'back', 'modules', _this.evt.module);
    _this.evt.functionPath    = path.join(_this.evt.modulePath, _this.evt.function);
        
    // Prep package.json
    packageJsonTemplate.name         = _this.evt.module;
    packageJsonTemplate.description  = 'A serverless module';
    packageJsonTemplate.dependencies = {};
    
    // Write base module structure
    writeDeferred.push(
      fs.mkdirSync(_this.evt.modulePath),
      fs.mkdirSync(path.join(_this.evt.modulePath, 'node_modules')),
      SUtils.writeFile(path.join(_this.evt.modulePath, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2)),
      SUtils.writeFile(path.join(_this.evt.modulePath, 's-module.json'), JSON.stringify(moduleJsonTemplate, null, 2))
    );

    // Copy NPM Dependencies
    wrench.copyDirSyncRecursive(
        path.join(_this._templatesDir, 'nodejs', 'dotenv'),
        path.join(_this.evt.modulePath, 'node_modules', 'dotenv')
    );
    
    // Write module/lib structure
    writeDeferred.push(
      fs.mkdirSync(path.join(_this.evt.modulePath, 'lib')),
      fs.mkdirSync(path.join(_this.evt.modulePath, 'lib', 'package')),
      fs.mkdirSync(path.join(_this.evt.modulePath, 'lib', 'package', 'functions'))
    );
     
    // Write module/function structure
    writeDeferred.push(
        fs.mkdirSync(_this.evt.functionPath),
        SUtils.writeFile(path.join(_this.evt.modulePath, 'lib', 'index.js'), libJs),
        SUtils.writeFile(path.join(_this.evt.functionPath, 'handler.js'), handlerJs),
        SUtils.writeFile(path.join(_this.evt.functionPath, 'event.json'), '{}'),
        SUtils.writeFile(path.join(_this.evt.functionPath, 's-function.json'), JSON.stringify(functionJsonTemplate, null, 2))
    ); 

    return BbPromise.all(writeDeferred);
  };

  /*
  * Generate s-module.json template (private)
  */
  
  _generateModuleJson() {
    let _this = this;
    let moduleJsonTemplate  = SUtils.readAndParseJsonSync(path.join(this._templatesDir, 's-module.json'));
    moduleJsonTemplate.name = _this.evt.module;
    return moduleJsonTemplate;
  };

  /*
  * Generate s-function.json template (private)
  */

  _generateFunctionJson() {
    let _this = this;
    let functionJsonTemplate = SUtils.readAndParseJsonSync(path.join(this._templatesDir, 's-function.json'));

    //We prefix with an l to make sure the CloudFormation module map index is unique
    functionJsonTemplate.name = _this.evt.module.charAt(0).toUpperCase() + _this.evt.module.slice(1) + _this.evt.function.charAt(0).toUpperCase() + _this.evt.function.slice(1);

    if (_this.evt.lambda) {
      functionJsonTemplate.cloudFormation.lambda.Function.Properties.Runtime = _this.evt.runtime;

      // Create files for lambda function
      switch (_this.evt.runtime) {
        case 'nodejs':
          functionJsonTemplate.cloudFormation.lambda.Function.Properties.Handler = path.join('modules', _this.evt.module, _this.evt.function, 'handler.handler');
          break;
        default:
          return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
          break;
      }
    } else {
      delete functionJsonTemplate.lambda;
    }

    if (_this.evt.endpoint) {
      functionJsonTemplate.cloudFormation.apiGateway.Endpoint.Path = _this.evt.module + '/' + _this.evt.function;
    } else {
      delete functionJsonTemplate.cloudFormation.apiGateway;
    }

    delete functionJsonTemplate.cloudFormation.lambda.EventSourceMapping;
    delete functionJsonTemplate.cloudFormation.lambda.AccessPolicyX;

    return functionJsonTemplate;
  };

  _installFunctionDependencies() {
    return SUtils.npmInstall(this.evt.modulePath);
  }
}

module.exports = ModuleCreate;
