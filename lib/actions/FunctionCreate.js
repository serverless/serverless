'use strict';

/**
 * Action: FunctionCreate
 * - takes existing module name and new function name
 * - validates that module exists
 * - validates that function does NOT already exists in module
 * - generates function sturcture based on runtime
 *
 * Event Properties:
 * - module:     (String) Name of the existing module you want to create a function for
 * - function:   (String) Name of the new function for your existing module
 */

const SPlugin  = require('../ServerlessPlugin'),
    SError     = require('../ServerlessError'),
    SCli       = require('../utils/cli'),
    path       = require('path'),
    BbPromise  = require('bluebird'),
    SUtils     = require('../utils');

let fs = require('fs');
BbPromise.promisifyAll(fs);

const supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs:  ['npm'],
  },
};


/**
 * FunctionCreate Class
 */

class FunctionCreate extends SPlugin {

  constructor(S, config) {
    super(S, config);
    this._templatesDir = path.join(__dirname, '..', 'templates');
    this.evt = {};
  }

  static getName() {
    return 'serverless.core.' + FunctionCreate.name;
  }

  registerActions() {
    this.S.addAction(this.functionCreate.bind(this), {
      handler:       'functionCreate',
      description:   `Creates scaffolding for a new function.
usage: serverless function create <function>`,
      context:       'function',
      contextAction: 'create',
      options:       [
        {
          option:      'module',
          shortcut:    'm',
          description: 'The name of the module you want to create a function for'
        },
        {
          option:      'function',
          shortcut:    'f',
          description: 'The name of your new function'
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
  }


  /**
   * Action
   */
 
  functionCreate(evt) {
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

    return this.S.validateProject()
        .bind(_this)
        .then(_this._promptModuleFunction)
        .then(_this._validateAndPrepare)
        .then(_this._createFunctionSkeleton)
        .then(function() {
          SCli.log('Successfully created ' + _this.evt.function + ' function.');
          return _this.evt;
        });
  }
  
  
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
          description: 'Enter the name of your existing module: '.yellow,
          message:     'Module name is required.',
          required:    true,
        },
        function:            {
          description: 'Enter a new function name: '.yellow,
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

    // senitize module
    this.evt.module = this.evt.module.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);

    // senitize function
    this.evt.function = this.evt.function.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);
    
    // If module does NOT exists, throw error
    let modulePath = path.join(this.S._projectRootPath, 'back', 'modules', this.evt.module);
    if (!SUtils.dirExistsSync(modulePath)) {
      return BbPromise.reject(new SError(
          'module ' + this.evt.module + ' does NOT exist',
          SError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }
    
    // If function already exists in module, throw error
    let functionPath = path.join(modulePath, this.evt.function);
    if (SUtils.dirExistsSync(functionPath)) {
      return BbPromise.reject(new SError(
          'function ' + this.evt.function + ' already exists in module ' + this.evt.module,
          SError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    return BbPromise.resolve();
  };
  
  
  /**
   * Create Function Skeleton
   */

  _createFunctionSkeleton() {
    let _this                = this,
        writeDeferred        = [],
        modulePath           = path.join(this.S._projectRootPath, 'back', 'modules', _this.evt.module),
        functionPath         = path.join(modulePath, _this.evt.function),
        functionJsonTemplate = _this._generateFunctionJson(),
        handlerJs            = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'handler.js')),
        indexJs              = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'index.js'));

     
    // write function structure
    writeDeferred.push(
        fs.mkdirSync(functionPath),
        SUtils.writeFile(path.join(functionPath, 'handler.js'), handlerJs),
        SUtils.writeFile(path.join(functionPath, 'index.js'), indexJs),
        SUtils.writeFile(path.join(functionPath, 'event.json'), '{}'),
        SUtils.writeFile(path.join(functionPath, 's-function.json'), JSON.stringify(functionJsonTemplate, null, 2))
    ); 

    return BbPromise.all(writeDeferred);
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
}

module.exports = FunctionCreate;
