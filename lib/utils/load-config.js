'use strict';

const path = require('path');
const { execSync } = require('child_process');

module.exports = async (configPath) => {
  try {
    return require(configPath);
  } catch (error) {
    // Fallback to import() if the runtime supports native ESM
    if (error.code === 'ERR_REQUIRE_ESM') {
      try {
        return (await import(`file:///${configPath}`)).default;
      } catch (errorESM) {
        // TypeScript .ts files can only be imported by Node if ts-node was registered on process startup
        // either with CLI flags '--loader ts-node/esm --experimental-modules --es-module-specifier-resolution=node'
        // or as environment variable 'NODE_OPTIONS="--loader ts-node/esm --es-module-specifier-resolution=node"'
        if (errorESM.code === 'ERR_UNKNOWN_FILE_EXTENSION' && path.extname(configPath) === '.ts') {
          // load-config-esm is an ES module that loads the config file and prints it to stdout
          const loadConfigEsm = path.join(__dirname, 'load-config-esm');

          // Execute the load-config-esm module with the config path as argument
          const config = execSync(
            `node --loader ts-node/esm --es-module-specifier-resolution=node ${loadConfigEsm} ${configPath}`
          ).toString();

          // Parse the config file
          return JSON.parse(config);
        }
      }
    }
    throw error;
  }
};
