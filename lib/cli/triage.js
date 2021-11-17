'use strict';

module.exports = async () => {
  const cliArgs = new Set(process.argv.slice(2));

  // Unconditionally favor "serverless" for version check
  if (cliArgs.has('--version')) return 'serverless';
  if (cliArgs.has('-v')) return 'serverless';

  // Unconditionally favor "@serverless/components" when component specific command or flag
  const componentsCommands = new Set(['registry', 'init', 'publish']);
  if (componentsCommands.has(process.argv[2])) return '@serverless/components';
  if (cliArgs.has('--help-components')) return '@serverless/components';
  if (cliArgs.has('--target')) return '@serverless/components';

  // Detect eventual component configuration
  const fsp = require('fs').promises;
  if (
    (
      await Promise.all(
        ['yml', 'yaml', 'json'].map(async (extension) => {
          try {
            await fsp.access(`serverless.component.${extension}`);
            return true;
          } catch {
            return false;
          }
        })
      )
    ).some(Boolean)
  ) {
    return '@serverless/components';
  }

  // Detect eventual service configuration
  const configurationExtension =
    (
      await Promise.all(
        ['yml', 'yaml', 'json', 'js', 'ts'].map(async (extension) => {
          try {
            await fsp.access(`serverless.${extension}`);
            return extension;
          } catch {
            return null;
          }
        })
      )
    ).find(Boolean) || null;

  if (configurationExtension) {
    // Found top level service configuration, recognize CLI by content
    const targetCliName = await (async () => {
      const resolveByObjectConfiguration = (configuration) => {
        if (configuration.provider) return 'serverless';
        if (configuration.component) return '@serverless/components';
        for (const value of Object.values(configuration)) {
          if (value.component) return '@serverless/cli';
        }
        return null;
      };
      switch (configurationExtension) {
        case 'yml':
        case 'yaml': {
          const content = await fsp.readFile(`serverless.${configurationExtension}`, 'utf8');
          if (content.search(/(?:^|\n)provider\s*:/) !== -1) return 'serverless';
          if (content.search(/(?:^|\n)component\s*:/) !== -1) return '@serverless/components';
          if (content.search(/\n\s+component\s*:/) !== -1) return '@serverless/cli';
          return null;
        }
        case 'json': {
          const configuration = (() => {
            try {
              return require(`${process.cwd()}/serverless.json`);
            } catch {
              return null;
            }
          })();
          if (!configuration) return 'serverless';
          return resolveByObjectConfiguration(configuration);
        }
        case 'js': {
          const configuration = (() => {
            try {
              return require(`${process.cwd()}/serverless.js`);
            } catch {
              return null;
            }
          })();
          if (!configuration) return 'serverless';
          if (typeof configuration === 'function') return '@serverless/cli';
          return resolveByObjectConfiguration(configuration);
        }
        case 'ts':
          return 'serverless';
        default:
          throw new Error(`Unrecognized extension "${configurationExtension}"`);
      }
    })();
    if (targetCliName) return targetCliName;
  }

  // No top level service configuration
  const isChinaUser = (() => {
    if (process.env.SLS_GEO_LOCATION) return process.env.SLS_GEO_LOCATION === 'cn';
    return new Intl.DateTimeFormat('en', { timeZoneName: 'long' })
      .format()
      .includes('China Standard Time');
  })();

  // If "sls" or "sls deploy" command and in China, force "@serverless/components"
  if (
    (process.argv.length === 2 || process.argv[2] === 'deploy') &&
    (isChinaUser || process.env.SERVERLESS_PLATFORM_VENDOR === 'tencent')
  ) {
    return '@serverless/components';
  }

  // Detect eventual component template
  const nestedTemplateKeywords = new Set([
    'deploy',
    'remove',
    'info',
    'help',
    '--help',
    'dev',
    'logs',
    'invoke',
    'credentials',
  ]);
  if (!nestedTemplateKeywords.has(process.argv[2])) return 'serverless';

  const path = require('path');
  const detectSubServiceType = async (subDirname) => {
    const subConfigurationExtension =
      (
        await Promise.all(
          ['yml', 'yaml', 'json', 'js'].map(async (extension) => {
            try {
              await fsp.access(path.resolve(subDirname, `serverless.${extension}`));
              return extension;
            } catch {
              return null;
            }
          })
        )
      ).find(Boolean) || null;
    if (!subConfigurationExtension) return null;
    switch (subConfigurationExtension) {
      case 'yml':
      case 'yaml': {
        const content = await fsp.readFile(
          path.resolve(subDirname, `serverless.${subConfigurationExtension}`),
          'utf8'
        );
        if (content.search(/(?:^|\n)component\s*:/) !== -1) return '@serverless/components';
        return 'other';
      }
      case 'json': {
        const configuration = (() => {
          try {
            return require(`${path.resolve(subDirname)}/serverless.json`);
          } catch {
            return null;
          }
        })();
        return configuration && configuration.component ? '@serverless/components' : 'other';
      }
      case 'js': {
        const configuration = (() => {
          try {
            return require(`${path.resolve(subDirname)}/serverless.js`);
          } catch {
            return null;
          }
        })();
        return configuration && configuration.component ? '@serverless/components' : 'other';
      }
      default:
        throw new Error(`Unrecognized extension "${subConfigurationExtension}"`);
    }
  };
  let hasComponent = false;
  for (const subDirname of await fsp.readdir('.')) {
    const stats = await fsp.lstat(subDirname);
    if (!stats.isDirectory()) continue;
    const subServiceType = await detectSubServiceType(subDirname);
    if (!subServiceType) continue;
    if (subServiceType === '@serverless/components') hasComponent = true;
    else return 'serverless';
  }
  return hasComponent ? '@serverless/components' : 'serverless';
};
