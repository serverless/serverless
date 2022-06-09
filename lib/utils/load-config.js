'use strict';

const path = require('path');
const { execSync } = require('node:child_process');

module.exports = async (configPath) => {
  try {
    return require(configPath);
  } catch (error) {
    // Fallback to import() if the runtime supports native ESM
    if (error.code === 'ERR_REQUIRE_ESM') {
      try {
        return (await import(`file:///${configPath}`)).default;
      } catch (errorESM) {
        if (errorESM.code === 'ERR_UNKNOWN_FILE_EXTENSION' && path.extname(configPath) === '.ts') {
          const loadConfigESM = path.join(__dirname, 'load-config-esm');
          const config = execSync(
            `node --loader ts-node/esm --experimental-modules --es-module-specifier-resolution=node ${loadConfigESM} ${configPath}`
          ).toString();

          return JSON.parse(config);
        }
      }
    }
    throw error;
  }
};
