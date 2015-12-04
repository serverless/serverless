'use strict';

/**
 * Action: ModuleCreate
 */

const SPlugin = require('../ServerlessPlugin'),
    SError  = require('../ServerlessError'),
    SCli    = require('../utils/cli'),
    path       = require('path'),
    BbPromise  = require('bluebird'),
    SUtils  = require('../utils');

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

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
    this._templatesDir   = path.join(__dirname, '..', '..', 'templates');
    this.evt = {};
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'serverless.core.' + ModuleCreate.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.S.addAction(this.moduleCreate.bind(this), {
      handler:       'moduleCreate',
      description:   `Creates scaffolding for a new serverless module.
usage: serverless module create <module> <function>`,
      context:       'module',
      contextAction: 'create',
      options:       [
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
  moduleCreate(evt) {
    let _this = this;

    if(evt) {
      _this.evt = evt;
      _this.S._interactive = false;
    }
    
    // If CLI, parse options & params
    if (_this.S.cli) {
      _this.evt = this.S.cli.options;
      _this.evt.module   = _this.S.cli.params[0];
      _this.evt.function = _this.S.cli.params[1];

      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }

    return this.S.validateProject()
        .bind(_this)
        .then(_this._promptModuleFunction)
        .then(_this._validateAndPrepare)
        .then(_this._createSkeleton)
        .then(_this._createPackageMgrSkeleton)
        .then(_this._initRuntime)
        .then(function() {
          SCli.log('Successfully created ' + _this.evt.module + '/' + _this.evt.function);
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
          description: 'Enter a module name of your new module: '.yellow,
          message:     'Module name is required.',
          required:    true,
        },
        function:            {
          description: 'Enter an function name for your new module: '.yellow,
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
  }
  

  _validateAndPrepare() {
    // non interactive validation
    if (!this.S._interactive) {

      // Check API Keys
      if (!this.S._awsProfile) {
        if (!this.S._awsAdminKeyId || !this.S._awsAdminSecretKey) {
          return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
        }
      }
      // Check Params
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

    return BbPromise.resolve();
  };

  _generateFunctionJson() {
    let _this = this;
    let functionTemplateJson = SUtils.readAndParseJsonSync(path.join(this._templatesDir, 's-function.json'));

    //We prefix with an l to make sure the CloudFormation module map index is unique
    functionTemplateJson.name = _this.evt.module.charAt(0).toUpperCase() + _this.evt.module.slice(1) + _this.evt.function.charAt(0).toUpperCase() + _this.evt.function.slice(1);

    if (_this.evt.lambda) {
      functionTemplateJson.cloudFormation.lambda.Function.Properties.Runtime = _this.evt.runtime;

      // Create files for lambda function
      switch (_this.evt.runtime) {
        case 'nodejs':
          functionTemplateJson.cloudFormation.lambda.Function.Properties.Handler = path.join('modules', _this.evt.module, _this.evt.function, 'handler.handler');
          break;
        default:
          return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
          break;
      }
    } else {
      delete functionTemplateJson.lambda;
    }

    if (_this.evt.endpoint) {
      functionTemplateJson.cloudFormation.apiGateway.Endpoint.Path = _this.evt.module + '/' + _this.evt.function;
    } else {
      delete functionTemplateJson.cloudFormation.apiGateway;
    }

    delete functionTemplateJson.cloudFormation.lambda.EventSourceMapping;
    delete functionTemplateJson.cloudFormation.lambda.AccessPolicyX;

    return functionTemplateJson;
  }

  _generateModuleAwsmJson() {
    let _this = this;
    let moduleTemplateJson  = SUtils.readAndParseJsonSync(path.join(this._templatesDir, 's-module.json'));
    moduleTemplateJson.name = _this.evt.module;
    return moduleTemplateJson;
  };

  /**
   *
   * @returns {Promise}
   * @private
   */
  _createSkeleton() {
    let _this              = this,
        writeFilesDeferred = [],
        modulePath         = path.join(this.S._projectRootPath, 'back', 'modules', _this.evt.module),
        functionPath         = path.join(modulePath, _this.evt.function);

    // If module/function already exists, throw error
    if (SUtils.dirExistsSync(functionPath)) {
      return BbPromise.reject(new SError(
          functionPath + ' already exists',
          SError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    //module path will get created by util.writeFile if DNE

    // If module s-module.json doesn't exist, create it
    if (!SUtils.fileExistsSync(path.join(modulePath, 's-module.json'))) {
      SUtils.sDebug('Module s-module.json does not exist. Creating..')
      let moduleTemplateJson = _this._generateModuleAwsmJson();
      writeFilesDeferred.push(
          SUtils.writeFile(
              path.join(modulePath, 's-module.json'),
              JSON.stringify(moduleTemplateJson, null, 2)
          )
      );
    }

    // Create function folder
    writeFilesDeferred.push(functionPath);

    // Create function s-function.json
    let functionTemplateJson = _this._generateFunctionJson(),
        handlerJs          = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'handler.js')),
        indexJs            = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'index.js'));

    writeFilesDeferred.push(
        SUtils.writeFile(path.join(functionPath, 'handler.js'), handlerJs),
        SUtils.writeFile(path.join(functionPath, 'index.js'), indexJs),
        SUtils.writeFile(path.join(functionPath, 'event.json'), '{}'),
        SUtils.writeFile(path.join(functionPath, 's-function.json'), JSON.stringify(functionTemplateJson, null, 2))
    );

    return BbPromise.all(writeFilesDeferred);
  }
  
  
  /**
   *
   * @returns {Promise}
   * @private
   */
  _createPackageMgrSkeleton() {
    let _this          = this,
        deferredWrites = [];

    switch (_this.evt.runtime) {
      case 'nodejs':
        if (_this.evt.pkgMgr == 'npm') {
          let node_modules_path = path.join(_this.S._projectRootPath, 'back', 'node_modules');
          
          // Create node_modules if DNE in project
          if (!SUtils.dirExistsSync(node_modules_path)) {
            deferredWrites.push(fs.mkdirAsync(node_modules_path));
          }
          
          let modulePath = path.join(_this.S._projectRootPath, 'back', 'node_modules', _this.evt.module);
          
          // create module dir if DNE in node_modules
          if (!SUtils.dirExistsSync(modulePath)) {
            deferredWrites.push(fs.mkdirAsync(modulePath));
          }
          
          // Create module package.json if DNE in node_module
          if (!SUtils.fileExistsSync(path.join(modulePath, 'package.json'))) {
            let packageJsonTemplate          = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'nodejs', 'package.json'));
            packageJsonTemplate.name         = _this.evt.module;
            packageJsonTemplate.description  = 'A serverless module';
            packageJsonTemplate.dependencies = {};
            
            deferredWrites.push(
                fs.writeFileAsync(path.join(modulePath, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2))
            );
          }

          // Create module s-module.json if DNE in node_module
          if (!SUtils.fileExistsSync(path.join(modulePath, 's-module.json'))) {
            let moduleTemplateJson = _this._generateModuleAwsmJson();
            deferredWrites.push(
                SUtils.writeFile(path.join(modulePath, 's-module.json'),
                    JSON.stringify(moduleTemplateJson, null, 2)));
          }

          // Create root lib folder if DNE in node_module
          let modLibPath = path.join(modulePath, 'lib');
          if (!SUtils.dirExistsSync(modLibPath)) {
            deferredWrites.push(fs.mkdirAsync(modLibPath));
          }

          // Create s-module folder if DNE in node_module
          if (!SUtils.dirExistsSync(path.join(modulePath, 's-module'))) {
            deferredWrites.push(fs.mkdirAsync(path.join(modulePath, 's-module')));
          }

          // Create function if DNE in node_module
          let functionPath = path.join(modulePath, 's-function', _this.evt.function);
          if (!SUtils.dirExistsSync(functionPath)) {

            let functionTemplateJson = this._generateFunctionJson(),
                handlerJs          = fs.readFileSync(path.join(_this._templatesDir, 'nodejs', 'handler.js')),
                indexJs            = fs.readFileSync(path.join(_this._templatesDir, 'nodejs', 'index.js'));

            deferredWrites.push(
                SUtils.writeFile(path.join(functionPath, 's-function.json'), JSON.stringify(functionTemplateJson, null, 2)),
                SUtils.writeFile(path.join(functionPath, 'handler.js'), handlerJs),
                SUtils.writeFile(path.join(functionPath, 'index.js'), indexJs),
                SUtils.writeFile(path.join(functionPath, 'event.json'), '{}')
            );
          }
        }

        break;
      default:
        break;
    }
    return BbPromise.all(deferredWrites);
  }



  /**
   *
   * @returns {Promise}
   * @private
   */
  _initRuntime() {
    let _this = this;

    SCli.log('Preparing your runtime..');

    if (_this.evt.runtime === 'nodejs') {
      let packageJsonTemplate  = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'nodejs', 'package.json'));
      packageJsonTemplate.name = _this.S._projectJson.name;
      return fs.writeFileAsync(path.join(_this.S._projectRootPath, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2))
          .then(function() {
            SCli.log('Installing jaws-core module...');
            SUtils.npmInstall(_this.S._projectRootPath);
          });
    }
  }
}

module.exports = ModuleCreate;
