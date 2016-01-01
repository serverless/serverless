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

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils'));

  let fs = require('fs');
  BbPromise.promisifyAll(fs);

  /**
   * FunctionCreate Class
   */

  class FunctionCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      this._templatesDir = path.join(__dirname, '..', 'templates');
      this.options = {};
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
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          },

        ],
      });
      return BbPromise.resolve();
    }


    /**
     * Action
     */

    functionCreate(options) {

      let _this = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      return _this._promptModuleFunction()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._createFunctionSkeleton)
          .then(function() {
            SCli.log('Successfully created function: "'  + _this.options.function + '"');

            // Return
            return {
              options: _this.options
            }
          });
    }

    /**
     * Prompt module & function if they're missing
     */

    _promptModuleFunction() {

      let _this = this,
          overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      ['module', 'function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this['options'][memberVarKey];
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
            _this.options.module   = answers.module;
            _this.options.function = answers.function;
          });
    };


    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {
      // Non interactive validation
      if (!this.S.config.interactive) {
        if (!this.options.module || !this.options.function) {
          return BbPromise.reject(new SError('Missing module or/and function names'));
        }
      }

      // Sanitize function folder name
      this.options.function = this.options.function.toLowerCase().trim()
          .replace(/\s/g, '-')
          .replace(/[^a-zA-Z-\d:]/g, '')
          .substring(0, 19);

      // If module does NOT exists, throw error
      this.options.module = this.options.module.trim();

      let moduleFullPath = path.join(this.S.config.projectPath, 'back', 'modules', this.options.module);
      if (!SUtils.dirExistsSync(moduleFullPath)) {
        return BbPromise.reject(new SError('module ' + this.options.module + ' does NOT exist',
            SError.errorCodes.INVALID_PROJECT_SERVERLESS));
      }

      // If function already exists in module, throw error
      let functionPath = path.join(this.S.config.projectPath, 'back', 'modules', this.options.module, 'functions', this.options.function);
      if (SUtils.dirExistsSync(functionPath)) {
        return BbPromise.reject(new SError('function ' + this.options.function + ' already exists in module ' + this.options.module,
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
          functionInstance     = new _this.S.classes.Function(_this.S, { module: _this.options.module, function: _this.options.function}),
          functionPath         = path.join('back', 'modules', _this.options.module, 'functions', _this.options.function),
          eventJson            = {},
          handlerJs            = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'handler.js'));

      eventJson[_this.options.function] = {};

      // Write function files: directory, handler, event.json, s-function.json
      writeDeferred.push(
          fs.mkdirSync(path.join(_this.S.config.projectPath, functionPath)),
          SUtils.writeFile(path.join(path.join(_this.S.config.projectPath, functionPath), 'handler.js'), handlerJs),
          SUtils.writeFile(path.join(_this.S.config.projectPath, functionPath, 'event.json'), JSON.stringify(eventJson, null, 2)),
          functionInstance.save()
      );

      return BbPromise.all(writeDeferred);
    };
  }

  return( FunctionCreate );
};
