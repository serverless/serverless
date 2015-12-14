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
 * - template:   (String) Name of the template to use to create the function JSON
 */

const SPlugin  = require('../ServerlessPlugin'),
    SError     = require('../ServerlessError'),
    SCli       = require('../utils/cli'),
    path       = require('path'),
    BbPromise  = require('bluebird'),
    SUtils     = require('../utils');

let fs = require('fs');
BbPromise.promisifyAll(fs);

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
          option:      'template',
          shortcut:    't',
          description: 'A template for a specific type of Function'
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

    if (evt) {
      _this.evt            = evt;
      _this.S._interactive = false;
    }

    // If CLI and not subaction, parse options
    if (_this.S.cli && (!evt || !evt._subaction)) {
      _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
      if (_this.S.cli.options.nonInteractive) _this.S._interactive = false;
    }

    return _this.S.validateProject()
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
          _this.evt.module   = answers.module;
          _this.evt.function = answers.function;
        });
  };


  /**
   * Validate and prepare data before creating module
   */

  _validateAndPrepare() {
    // Non interactive validation
    if (!this.S._interactive) {
      if (!this.evt.module || !this.evt.function) {
        return BbPromise.reject(new SError('Missing module or/and function names'));
      }
    }

    // Add default runtime
    if (!this.evt.runtime) {
      this.evt.runtime = 'nodejs';
    }

    // Check if runtime is supported
    if (!SUtils.supportedRuntimes[this.evt.runtime]) {
      return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
    }

    // Set default function template
    if (!this.evt.template) this.evt.template = 's-function.json';

    // Sanitize function folder name
    this.evt.function = this.evt.function.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);

    // If module does NOT exists, throw error
    this.evt.module = this.evt.module.trim();

    let moduleFullPath = path.join(this.S._projectRootPath, 'back', 'modules', this.evt.module);
    if (!SUtils.dirExistsSync(moduleFullPath)) {
      return BbPromise.reject(new SError('module ' + this.evt.module + ' does NOT exist',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS));
    }

    // If function already exists in module, throw error
    let functionPath = path.join(this.S._projectRootPath, 'back', 'modules', this.evt.module, this.evt.function);
    if (SUtils.dirExistsSync(functionPath)) {
      return BbPromise.reject(new SError('function ' + this.evt.function + ' already exists in module ' + this.evt.module,
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
      ));
    }

    // Fetch Module Json
    let moduleName             = this.evt.module;

    this.evt.module            = SUtils.readAndParseJsonSync(path.join(moduleFullPath, 's-module.json'));
    this.evt.module.pathModule = path.join('back', 'modules', moduleName);

    return BbPromise.resolve();
  };


  /**
   * Create Function Skeleton
   */

  _createFunctionSkeleton() {

    let _this                = this,
        writeDeferred        = [],
        eventJson            = {},
        handlerFile          = fs.readFileSync(path.join(this._templatesDir,
                                               SUtils.supportedRuntimes[this.evt.runtime].templateSubDir,
                                               SUtils.supportedRuntimes[this.evt.runtime].templateHandler));

    // Generate Function JSON
    let functionShortName              = _this.evt.function;
    let functionJson                   = _this._generateFunctionJson();

    // Change EVT function to Object
    _this.evt.function                 = functionJson.functions[Object.keys(functionJson.functions)[0]];
    _this.pathFunction                 = path.join('back', 'modules', _this.evt.module.name, functionShortName);

    // Set function on event
    eventJson[_this.evt.function.name] = {};

    // Write function files: directory, handler, event.json, s-function.json
    writeDeferred.push(
        fs.mkdirSync(path.join(_this.S._projectRootPath, _this.pathFunction)),
        SUtils.writeFile(path.join(path.join(_this.S._projectRootPath, _this.pathFunction), SUtils.supportedRuntimes[this.evt.runtime].templateHandler), handlerFile),
        SUtils.writeFile(path.join(_this.S._projectRootPath, _this.pathFunction, 'event.json'), JSON.stringify(eventJson, null, 2)),
        SUtils.writeFile(path.join(_this.S._projectRootPath, _this.pathFunction, 's-function.json'), JSON.stringify(functionJson, null, 2))
    );

    // Add path function to evt function
    _this.evt.function.pathFunction = _this.pathFunction;

    return BbPromise.all(writeDeferred);
  };

  /*
   * Generate s-function.json template (private)
   */

  _generateFunctionJson() {

    let _this = this;

    // Load s-function.json template
    let functionJsonTemplate = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, _this.evt.template));

    // Add Full Function Name (Include Module Name)
    _this.functionName  = _this.evt.module.name.charAt(0).toUpperCase() + _this.evt.module.name.slice(1) + _this.evt.function.charAt(0).toUpperCase() + _this.evt.function.slice(1);
    functionJsonTemplate.functions[_this.functionName] = functionJsonTemplate.functions.functionTemplate;

    // Remove Template
    delete functionJsonTemplate.functions.functionTemplate;

    // Add Function Handler
    functionJsonTemplate.functions[_this.functionName].handler = path.join('modules', _this.evt.module.name, _this.evt.function, 'handler.handler');

    // Add endpoint path
    functionJsonTemplate.functions[_this.functionName].endpoints[0].path = _this.evt.module.name + '/' + _this.evt.function;

    // Return
    return functionJsonTemplate;
  };
}

module.exports = FunctionCreate;
