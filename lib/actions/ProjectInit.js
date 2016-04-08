'use strict';

/**
 * Action: ProjectInit
 * - Takes a project and initializes it
 * - Creates a _meta folder
 * - Creates CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 *
 * Options:
 * - name                 (String) a new name for this project
 * - profile              (String) an AWS profile to use for your first stage. Must be available in ~/.aws/credentials
 * - stage                (String) the first stage for your new project
 * - region               (String) the first region for your new project
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports   = function(S) {

  const path   = require('path'),
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    os         = require('os'),
    fs         = BbPromise.promisifyAll(require('fs'));

  class ProjectInit extends S.classes.Plugin {

    constructor(config) {
      super(config);
    }

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.projectInit.bind(this), {
        handler:       'projectInit',
        description:   'Initializes a Serverless project',
        context:       'project',
        contextAction: 'init',
        options:       [
          {
            option:      'name',
            shortcut:    'n',
            description: 'A new name for this Serverless project'
          }, {
            option:      'stage',
            shortcut:    's',
            description: 'Initial project stage'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Initial Lambda supported AWS region'
          }, {
            option:      'profile',
            shortcut:    'p',
            description: 'AWS profile that is set in your aws config file'
          }, {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Action
     */

    projectInit(evt) {

      this.evt = evt;

      // Greet
      if (S.config.interactive && !this.evt.options.noGreeting) SCli.asciiGreeting();

      console.log('');
      SCli.log('Initializing Serverless Project...');

      /**
       * Control Flow
       */

      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(this._scaffold)
        .then(this._createStageAndRegion)
        .then(() => {
          SCli.log(`Successfully initialized project "${this.evt.options.name}"`);
          return this.evt;
        });
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this,
        name;

      // Skip if name is provided, or project exists
      if (_this.evt.options.name) return BbPromise.resolve();
      if (S.hasProject()) {
        _this.evt.options.name = S.getProject().getName();
        return BbPromise.resolve();
      }

      name = _this.evt.options.name ? _this.evt.options.name : ('serverless-' + S.utils.generateShortId(6)).toLowerCase();

      // Skip if non-interactive
      if (!S.config.interactive) return BbPromise.resolve();

      // Values that exist will not be prompted
      let overrides = {
        name: _this.evt.options.name
      };

      let prompts = {
        properties: {
          name:              {
            description: 'Enter a name for this project: '.yellow,
            default:     name,
            message:     'Name must be only letters, numbers or dashes',
            required:    true,
            conform:     function(name) {
              let re = /^[a-zA-Z0-9-_]+$/;

              // This hack updates the defaults in the other prompts
              if (re.test(name)) _this.evt.options.name = name;
              return re.test(name);
            }
          }
        }
      };

      return this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.name = answers.name;
        });
    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI and prepare project data
     */

    _validateAndPrepare() {

      // Validate Name - AWS only allows Alphanumeric and - in name
      let nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.evt.options.name);
      if (!nameOk) {
        return BbPromise.reject(new SError('Project names can only be alphanumeric and -'));
      }

      return BbPromise.resolve();
    }

    /**
     * Update Scaffolding
     */

    _scaffold() {

      let _this = this;
      let files = [];

      return BbPromise.try(function() {

          // If no project exists, set it
          if( !S.hasProject() ) {
            S.updateConfig({
              projectPath: path.resolve(path.join(path.dirname('.'), _this.evt.options.name))
            });
            S.setProject(new S.classes.Project());
          }

          // Fill in project attributes
          _this.project          = S.getProject();
          _this.project.name     = _this.evt.options.name ? _this.evt.options.name : _this.project.name;

          // Add default project variables
          _this.project.addVariables({
            project:             _this.project.name
          });

          // Save Project
          return _this.project.save();
        })
        .then(function() {

          // Create other scaffolding

          // If package.json does not exist, save it
          let packageJson;
          if (!S.utils.fileExistsSync(_this.project.getRootPath( 'package.json' ))) {

            // Prepare new package.json
            packageJson               = S.utils.readFileSync(path.join(S.config.serverlessPath, 'templates', 'nodejs', 'package.json'));
            packageJson.name          = _this.project.getName();
            packageJson.description   = 'A Serverless Project and its Serverless Plugin dependencies.';
            packageJson.private       = false;
            packageJson.dependencies  = {};
            if (packageJson.devDependencies) delete packageJson.devDependencies;
            if (packageJson.keywords)        delete packageJson.keywords;
            files.push(fs.writeFileAsync(_this.project.getRootPath( 'package.json' ), JSON.stringify(packageJson, null, 2)))

          } else {

            // Modify existing package.json
            packageJson       = S.utils.readFileSync(_this.project.getRootPath( 'package.json' ));
            packageJson.name  = _this.project.getName();

            // Delete unnecessary package.json properties, if they exist
            if (packageJson.readme)  delete packageJson.readme;
            if (packageJson.readmeFilename)  delete packageJson.readmeFilename;
            if (packageJson.gitHead)  delete packageJson.gitHead;
            if (packageJson._id)  delete packageJson._id;
            if (packageJson._shasum)  delete packageJson._shasum;
            if (packageJson._from)  delete packageJson._from;
            if (packageJson._npmVersion)  delete packageJson._npmVersion;
            if (packageJson._nodeVersion)  delete packageJson._nodeVersion;
            if (packageJson._npmUser)  delete packageJson._npmUser;
            if (packageJson.dist)  delete packageJson.dist;
            if (packageJson.maintainers)  delete packageJson.maintainers;
            if (packageJson.directories)  delete packageJson.directories;
            if (packageJson._resolved)  delete packageJson._resolved;
            if (packageJson._args)  delete packageJson._args;
            if (packageJson._inCache)  delete packageJson._inCache;
            if (packageJson._installable)  delete packageJson._installable;
            if (packageJson._location)  delete packageJson._location;
            if (packageJson._phantomChildren)  delete packageJson._phantomChildren;
            if (packageJson._requested)  delete packageJson._requested;
            if (packageJson._requiredBy)  delete packageJson._requiredBy;
            if (packageJson._shrinkwrap || packageJson._shrinkwrap === null)  delete packageJson._shrinkwrap;
            if (packageJson._spec)  delete packageJson._spec;
            if (packageJson._where)  delete packageJson._where;
            files.push(fs.writeFileAsync(_this.project.getRootPath( 'package.json' ), JSON.stringify(packageJson, null, 2)))
          }

          // If .gitignore does not exist, save it
          if (!S.utils.fileExistsSync(_this.project.getRootPath( '.gitignore' ))) {
            files.push(fs.writeFileAsync(_this.project.getRootPath( '.gitignore' ), fs.readFileSync(path.join(S.config.serverlessPath, 'templates', 'gitignore'))));
          }

          return BbPromise.all(files);
        });
    }

    /**
     * Create Stage And Region
     */

    _createStageAndRegion() {

      let _this = this;

      return S.actions.stageCreate({
        options: {
          stage:   _this.evt.options.stage,
          region:  _this.evt.options.region,
          profile: _this.evt.options.profile,
          noExeCf: _this.evt.options.noExeCf ? true : false
        }
      });

      // The Select prompt conflicts and causes the double input issue
      // commented out for now till we fix our prompts
      // ==============================================================
      //let choices = [{
      //  key:   '',
      //  value: true,
      //  label: 'Yes'
      //}, {
      //  key:   '',
      //  value: false,
      //  label: 'No'
      //}];
      //
      //return BbPromise
      //  .try(() => {
      //
      //    // If interactive, skip
      //    if (!S.config.interactive) return true;
      //
      //    return _this.cliPromptSelect('Do you want to create a new stage and region for this project? ', choices, false)
      //      .then(results => results[0].value)
      //  })
      //  .then(answer => {
      //
      //    if (answer) {
      //      return S.actions.stageCreate({
      //        options: {
      //          stage:   _this.evt.options.stage,
      //          region:  _this.evt.options.region,
      //          profile: _this.evt.options.profile,
      //          noExeCf: _this.evt.options.noExeCf ? true : false
      //        }
      //      });
      //    }
      //  });
    }
  }

  return( ProjectInit );
};