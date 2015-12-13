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
          SCli.log('Successfully created function: "'  + _this.functionName + '"');
          return _this.evt;
        });
  }

  /**
   * Prompt module & function if they're missing
   */
  
  _promptModuleFunction() {

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
    
    return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.moduleName = answers.module;
          _this.functionName = answers.function;
        });
  };
  

  /**
   * Validate and prepare data before creating module
   */

  _validateAndPrepare() {

    // Non interactive validation
    if (!this.S._interactive) {
      if (!this.moduleName || !this.functionName) {
        return BbPromise.reject(new SError('Missing module or/and function names'));
      }
    }
    
    // Add default runtime
    if (!this.evt.runtime) {
      this.evt.runtime = 'nodejs';
    }

    if (!supportedRuntimes[this.evt.runtime]) {
      return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
    }

    // Sanitize module
    this.moduleName = this.moduleName.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);

    // Sanitize function
    this.functionName = this.functionName.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);
    
    // If module does NOT exists, throw error
    let moduleFullPath = path.join(this.S._projectRootPath, 'back', 'modules', this.moduleName);
    if (!SUtils.dirExistsSync(moduleFullPath)) {
      return BbPromise.reject(new SError('module ' + this.evt.module + ' does NOT exist',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS));
    } else {
      this.evt.module = SUtils.readAndParseJsonSync(path.join(moduleFullPath, 's-module.json'));
      this.evt.module.pathModule = path.join('back', 'modules', this.moduleName);
    }

    // If function already exists in module, throw error
    let functionPath = path.join(this.S._projectRootPath, 'back', 'modules', this.moduleName, this.functionName);
    if (SUtils.dirExistsSync(functionPath)) {
      return BbPromise.reject(new SError('function ' + this.evt.function + ' already exists in module ' + this.evt.module.name,
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
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
        eventJson            = {},
        handlerJs            = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'handler.js'));

    // Set function on event
    let functionJson                   = _this._generateFunctionJson();
    let functionObject                 = functionJson.functions[Object.keys(functionJson.functions)[0]];
    this.evt.function                  = functionObject;
    eventJson[_this.evt.function.name] = {};
    let pathFunction                   = path.join(_this.S._projectRootPath, 'back', 'modules', _this.evt.module.name, _this.functionName, 's-function.json');

    // Write function structure
    writeDeferred.push(
        fs.mkdirSync(pathFunction.replace('/s-function.json','')),
        SUtils.writeFile(path.join(pathFunction.replace('s-function.json', ''), 'handler.js'), handlerJs),
        SUtils.writeFile(path.join(pathFunction.replace('s-function.json', ''), 'event.json'), JSON.stringify(eventJson, null, 2)),
        SUtils.writeFile(pathFunction, JSON.stringify(functionJson, null, 2))
    );

    return BbPromise.all(writeDeferred);
  };

  /*
   * Generate s-function.json template (private)
   */

  _generateFunctionJson() {

    let _this = this;
    let functionJsonTemplate = SUtils.readAndParseJsonSync(path.join(this._templatesDir, 's-function.json'));

    // Add Full Function Name (Include Module Name)
    let fullFunctionName = _this.evt.module.name.charAt(0).toUpperCase() + _this.evt.module.name.slice(1) + _this.functionName.charAt(0).toUpperCase() + _this.functionName.slice(1);
    functionJsonTemplate.functions[fullFunctionName] = functionJsonTemplate.functions.functionTemplate;
    delete functionJsonTemplate.functions.functionTemplate;

    // Add Function Handler
    _this.evt.handler = path.join('modules', _this.evt.module.name, _this.functionName, 'handler.handler');
    functionJsonTemplate.functions[fullFunctionName].handler = _this.evt.handler;

    // Add Function Endpoints
    _this.evt.endpoint = _this.evt.module.name + '/' + _this.evt.function;
    functionJsonTemplate.functions[fullFunctionName].endpoints[_this.evt.endpoint] = functionJsonTemplate.functions[fullFunctionName].endpoints.endpointTemplate;
    delete functionJsonTemplate.functions[fullFunctionName].endpoints.endpointTemplate;

    // Return
    return functionJsonTemplate;
  };
}

module.exports = FunctionCreate;
