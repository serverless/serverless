'use strict';

/**
 * Action: ComponentCreate
 * - takes component, module and function names
 * - validates that component doesn't already exist
 * - generates module and function sturcture based on runtime
 *
 * Options:
 * - component:    (String) Name of your new component
 * - module:    (String) Name of your first module in your new component
 * - function:  (String) Name of your first function in your new component
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    SUtils     = require(path.join(serverlessPath, 'utils')),
    BbPromise  = require('bluebird'),
    fs         = require('fs');

  BbPromise.promisifyAll(fs);

  /**
   * ModuleCreate Class
   */

  class ComponentCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      this._templatesDir  = path.join(__dirname, '..', 'templates');
    }

    static getName() {
      return 'serverless.core.' + ComponentCreate.name;
    }

    registerActions() {
      this.S.addAction(this.componentCreate.bind(this), {
        handler:       'componentCreate',
        description:   `Creates scaffolding for a new serverless component.
usage: serverless component create`,
        context:       'component',
        contextAction: 'create',
        options:       [
          {
            option:      'component',
            shortcut:    'c',
            description: 'The name of your new component'
          },
          {
            option:      'module',
            shortcut:    'm',
            description: 'The name of your first module in your new component'
          },
          {
            option:      'function',
            shortcut:    'f',
            description: 'The name of your first function in your new component'
          },
          {
            option:      'runtime',
            shortcut:    'r',
            description: 'Runtime of your new module. Default: nodejs'
          }
        ]
      });

      return BbPromise.resolve();
    };

    /**
     * Action
     */

    componentCreate(evt) {

      let _this     = this;
      _this.evt     = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._createComponentSkeleton)
        .then(_this._createModuleSkeleton)
        .then(_this._installComponentDependencies)
        .then(function() {

          SCli.log('Successfully created new serverless component: ' + _this.evt.options.component);

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return _this.evt;

        });
    };

    /**
     * Prompt component, module & function, if missing
     */

    _prompt() {

      let _this = this,
        overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      ['component', 'module', 'function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this.evt.options[memberVarKey];
      });

      let prompts = {
        properties: {
          component: {
            default:     'nodejscomponent',
            description: 'Enter a name for your new component: '.yellow,
            message:     'Component name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(componentName) {
              return SUtils.isModuleNameValid(componentName);
            }
          },
          module: {
            default:     'resource',
            description: 'Enter a name for your component\'s first module: '.yellow,
            message:     'Module name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(moduleName) {
              return SUtils.isModuleNameValid(moduleName);
            }
          },
          function: {
            default:     'show',
            description: 'Enter a name for your module\'s first function: '.yellow,
            message:     'Function name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(functionName) {
              return SUtils.isFunctionNameValid(functionName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.component = answers.component;
          _this.evt.options.module    = answers.module;
          _this.evt.options.function  = answers.function;
        });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      // non interactive validation
      if (!this.S.config.interactive) {
        if (!this.evt.options.component || !this.evt.options.module || !this.evt.options.function) {
          return BbPromise.reject(new SError('Component, Module and Function names are all required.'));
        }
      }

      // Add default runtime
      if (!this.evt.options.runtime) {
        this.evt.options.runtime = 'nodejs';
      }

      if (!SUtils.supportedRuntimes[this.evt.options.runtime]) {
        return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.options.runtime, SError.errorCodes.UNKNOWN));
      }

      // Check is not reserved name
      if (['meta', 'plugins'].indexOf(this.evt.options.component) != -1) {
        return BbPromise.reject(new SError('This component name is reserved: ' + this.evt.options.component, SError.errorCodes.UNKNOWN));
      }

      // If component exists in project, throw error
      if (SUtils.doesComponentExist(this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.component + ' already exists',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create component Skeleton
     */

    _createComponentSkeleton() {

      let _this              = this,
        writeDeferred        = [],
        packageJsonTemplate  = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'nodejs', 'package.json')),
        libJs                = fs.readFileSync(path.join(_this._templatesDir, 'nodejs', 'index.js'));

      // Create Component instance
      this.component                  = new this.S.classes.Component(this.S, { component: this.evt.options.component });
      this.component.data.name        = this.evt.options.component;
      this.component.data.runtime     = this.evt.options.runtime;

      // TODO: Support multiple runtimes

      // Prep package.json
      packageJsonTemplate.name        = this.component.data.name ;
      packageJsonTemplate.description = 'Dependencies for a Serverless Component written in Node.js';

      // Write base component structure
      writeDeferred.push(
        fs.mkdirSync(path.join(_this.S.config.projectPath, _this.component.data.name)),
        fs.mkdirSync(path.join(_this.S.config.projectPath, _this.component.data.name, 'lib')),
        SUtils.writeFile(path.join(_this.S.config.projectPath, _this.component.data.name, 'lib', 'index.js'), libJs),
        SUtils.writeFile(path.join(_this.S.config.projectPath, _this.component.data.name, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2)),
        this.component.save()
      );

      return BbPromise.all(writeDeferred);
    };

    /**
     * Create Module Skeleton
     */

    _createModuleSkeleton() {

      let _this = this,
        newEvt = {
          options: {
            component:  _this.component.data.name,
            module:     _this.evt.options.module,
            function:   _this.evt.options.function,
            runtime:    _this.component.runtime
          }
        };

      return _this.S.actions.moduleCreate(newEvt);
    };

    /**
     * Install Component Dependencies
     */

    _installComponentDependencies() {
      SCli.log('Installing "serverless-helpers" for this component via NPM...');
      SUtils.npmInstall(path.join(this.S.config.projectPath, this.evt.options.component));
      return BbPromise.resolve();
    }
  }

  return( ComponentCreate );
};