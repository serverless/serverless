'use strict';

module.exports = async () => {
  const cliArgs = new Set(process.argv.slice(2));

  // Unconditionally favor "serverless" for version check
  if (cliArgs.has('--version')) return 'serverless';
  if (cliArgs.has('-v')) return 'serverless';

  // Detect eventual component configuration
  const fsp = require('fs').promises;

  const isChinaUser = (() => {
    if (process.env.SLS_GEO_LOCATION) return process.env.SLS_GEO_LOCATION === 'cn';
    return new Intl.DateTimeFormat('en', { timeZoneName: 'long' })
      .format()
      .includes('China Standard Time');
  })();

  const resolvePlatformCli = () => {
    // Support SERVERLESS_PLATFORM_VENDOR to be configured in .env files
    const dotenv = require('dotenv');
    dotenv.config({ path: require('path').resolve('.env') });

    if (process.env.SERVERLESS_PLATFORM_VENDOR) {
      return process.env.SERVERLESS_PLATFORM_VENDOR === 'tencent'
        ? 'serverless-tencent'
        : '@serverless/components';
    }
    return isChinaUser ? 'serverless-tencent' : '@serverless/components';
  };

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
    return resolvePlatformCli();
  }

  // Used only for Compose, based on a simplified construction of command
  const command = (() => {
    const args = process.argv.slice(2);
    // Simplified check - if arg starts with `-` then we consider it to be
    // a param and everything before it to be a command
    const firstParamIndex = args.findIndex((element) => element.startsWith('-'));

    const commands = args.slice(0, firstParamIndex === -1 ? Infinity : firstParamIndex);
    return commands.join(' ');
  })();

  const isComposeIgnoredCommand = new Set([
    '',
    'config',
    'config credentials',
    'create',
    'doctor',
    'generate-event',
    'install',
    'login',
    'logout',
    'plugin list',
    'plugin search',
    'upgrade',
    'uninstall',
  ]).has(command);

  // Used only for Compose check
  const isHelpRequest = command === '' && new Set(process.argv).has('--help');

  if (!isComposeIgnoredCommand || isHelpRequest) {
    if (
      (
        await Promise.all(
          ['yml', 'yaml', 'json', 'js', 'ts'].map(async (extension) => {
            try {
              await fsp.access(`serverless-compose.${extension}`);
              return true;
            } catch {
              return false;
            }
          })
        )
      ).some(Boolean)
    ) {
      return '@serverless/compose';
    }
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
        if (configuration.component) return resolvePlatformCli();
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
          if (content.search(/(?:^|\n)component\s*:/) !== -1) return resolvePlatformCli();
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
  if (isChinaUser) return resolvePlatformCli();

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
  return hasComponent ? resolvePlatformCli() : 'serverless';
};
