// Runs complete serverless instance in preconfigured environment, limited
// to predefined plugins and hook events.
// Optionally serverless instance can be freshly required with specifc modules mocked

'use strict';

const { entries, values } = require('lodash');
const overrideEnv = require('process-utils/override-env');
const overrideCwd = require('process-utils/override-cwd');
const overrideArgv = require('process-utils/override-argv');

const resolveServerless = (modulesCacheStub, callback) => {
  if (!modulesCacheStub) return callback(require('../../lib/Serverless'));
  const originalCache = Object.assign({}, require.cache);
  for (const key of Object.keys(require.cache)) delete require.cache[key];
  for (const [key, value] of entries(modulesCacheStub)) require.cache[key] = { exports: value };

  const restore = () => {
    for (const key of Object.keys(require.cache)) delete require.cache[key];
    Object.assign(require.cache, originalCache);
  };
  try {
    return callback(require('../../lib/Serverless')).then(
      result => {
        restore();
        return result;
      },
      error => {
        restore();
        throw error;
      }
    );
  } catch (error) {
    restore();
    throw error;
  }
};

module.exports = ({
  cwd,
  cliArgs,
  env,
  pluginConstructorsWhitelist,
  hookNamesWhitelist,
  modulesCacheStub,
}) =>
  overrideEnv(() => {
    if (env) Object.assign(process.env, env);
    return overrideCwd(cwd, () =>
      overrideArgv({ args: ['serverless', ...(cliArgs || [])] }, () =>
        resolveServerless(modulesCacheStub, Serverless => {
          // Intialize serverless instances in preconfigured environment
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
      )
    );
  });
