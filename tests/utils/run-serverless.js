// Runs complete serverless instances in preconfigured environement, and limited
// to predefined plugins and hook events

'use strict';

const { values } = require('lodash');
const overrideCwd = require('process-utils/override-cwd');
const overrideArgv = require('process-utils/override-argv');
const Serverless = require('../../lib/Serverless');

module.exports = ({ cwd, cliArgs, pluginConstructorsWhitelist, hookNamesWhitelist }) =>
  overrideCwd(cwd, () =>
    overrideArgv({ args: ['serverless', ...(cliArgs || [])] }, () => {
      // Intialize serverless instances in preconfigured environement
      const serverless = new Serverless();
      const { pluginManager } = serverless;
      return serverless.init().then(() => {
        // Strip registered hooks, so only those intended are executed
        const whitelistedPlugins = pluginManager.plugins.filter(plugin =>
          pluginConstructorsWhitelist.some(Plugin => plugin instanceof Plugin)
        );

        const { hooks } = pluginManager;
        for (const hookName of Object.keys(hooks)) {
          if (!hookNamesWhitelist.includes(hookName)) {
            delete hooks[hookName];
            continue;
          }
          hooks[hookName] = hooks[hookName].filter(({ hook }) =>
            whitelistedPlugins.some(whitelistedPlugin =>
              values(whitelistedPlugin.hooks).includes(hook)
            )
          );
        }

        // Run plugin manager hooks
        return serverless.run();
      });
    })
  );
