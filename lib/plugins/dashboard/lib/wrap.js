'use strict';

/*
 * Wrap
 * - Bundles the ServerlessSDK into your functions
 * - Wraps your function handlers with the ServerlessSDK
 */

const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const JSZip = require('jszip');
const log = require('./log');
const { getOrCreateAccessKeyForOrg } = require('./client-utils');
const { addTree, writeZip } = require('./zip-tree');
const { version } = require('../package.json');
const { shouldWrap, shouldWrapFunction } = require('./wrap-utils');

const deprecatedNodes = ['nodejs', 'nodejs4.3', 'nodejs4.3-edge'];
const supportedNodeRuntime = (runtime) =>
  runtime && runtime.includes('nodejs') && !deprecatedNodes.includes(runtime);
const pythonRuntimes = [
  'python2.7',
  'python3.6',
  'python3.7',
  'python3.8',
  'python3.9',
  'python3.10',
];
const supportedPythonRuntime = (runtime) => runtime && pythonRuntimes.includes(runtime);
const supportedRuntime = (runtime) =>
  supportedNodeRuntime(runtime) || supportedPythonRuntime(runtime);

const isDevMode = Boolean(process.env.SLS_DEV_MODE);

const isLocalInvocation = (ctx) => {
  const { commands } = ctx.sls.processedInput;
  return commands[0] === 'invoke' && commands[1] === 'local';
};

/*
 * Wrap Node.js Functions
 */
const wrapNodeJs = (fn, ctx, accessKey) => {
  const standardHandlerExec = `
try {
  const userHandler = require('./${fn.entryOrig}.js');
  module.exports.handler = serverlessSDK.handler(userHandler.${fn.handlerOrig}, handlerWrapperArgs);
} catch (error) {
  module.exports.handler = serverlessSDK.handler(() => { throw error }, handlerWrapperArgs);
}`;

  /**
   * If you're in "dev mode" export a slightly different wrapped handler. Basically, we need to:
   *
   * 1. Establish a connection to the websocket so we can collect logs and metrics
   * 2. import the user handler AFTER the websocket is connected so we get logs/errors on loading
   * 3. Call the user handler
   * 4. Respect the original return values and bubble those up
   *
   * It should be noted that dev mode will ALWAYS return a promise, there is no way around that
   * because dev mode requires the setup of the web socket which is async.  Additionally, if the
   * userHandler has a `require('aws-sdk')` the function will timeout UNLESS we have already
   * required the package from the global context
   **/
  const devModeHandlerExec = `
const studioHandler = (event, context, callback) => {
  console.log('Starting serverless Studio');
  return new Promise((resolve, reject) => {

    // handle callback resolutions since we always return a promise
    let finalized = false;
    const finalize = (error, result, isFromCallback) => {
      if (finalized) { return; }
      finalized = true;
      serverlessSDK
        .publishSync({
          event: "studio.invocationInfo",
          data: {
            functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
            requestId: context.awsRequestId,
            transactionId: event.requestContext ? event.requestContext.requestId : null,
            response: result,
            error: error
          }
        })
        .catch((err) => {
          console.log('Unable to send response data to Studio', err);
        })
        .finally(() => {
					serverlessSDK.stopDevMode();
					if (isFromCallback) callback(error, result);
          else if (error) reject(error);
          else resolve(result);
        });
    }

    // Patch context methods
    const contextProxy = new Proxy(context, {
      get: (target, prop) => {
        if (prop === 'done') {
          return (err, res) => {
            finalize(err, res, true)
          };
        } else if (prop === 'succeed') {
          return res => {
            finalize(null, res, true);
          };
        } else if (prop === 'fail') {
          return err => {
            finalize(err, null, true);
          };
        }
        return target[prop];
      },
    });

    // Start dev mode
    serverlessSDK
      .startDevMode(event, context)
      .then(() => {
        try {
          serverlessSDK.publish({
            event: "studio.invocationInfo",
            data: {
              functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
              requestId: context.awsRequestId,
              transactionId: event.requestContext ? event.requestContext.requestId : null,
              event
            }
          });
        } catch (err) {
          console.log('Unable to send invocation data to Studio', err);
        }
				const userHandler = require('./${fn.entryOrig}.js');
				let result;
        try {
					result = serverlessSDK.handler(userHandler.${fn.handlerOrig}, handlerWrapperArgs)(
						event, contextProxy, (error, result) => finalize(error, result, true)
					);
				} catch (error) {
          console.log('Error invoking wrapped function', error);
					finalize(error, null, true);
					return;
        }
				// if a promise was returned, we need to return the resolved promise
				if (result && typeof result.then === 'function') {
					result.then(res => finalize(null, res), finalize);
				}
      }, (error) => {
				console.error('Unable to start Studio mode', error);
				callback(error);
      });
  });
};
module.exports.handler = studioHandler`;

  const newHandlerCode = `
var serverlessSDK = require('./serverless_sdk/index.js');
serverlessSDK = new serverlessSDK({
  orgId: '${ctx.sls.service.org}',
  applicationName: '${ctx.sls.service.app}',
  appUid: '${ctx.sls.service.appUid}',
  orgUid: '${ctx.sls.service.orgUid}',
  deploymentUid: '${ctx.deploymentUid}',
  serviceName: '${ctx.sls.service.service}',
  shouldLogMeta: ${
    !isLocalInvocation(ctx) &&
    _.get(ctx.sls.service.custom, ['enterprise', 'collectLambdaLogs']) !== false
  },
  shouldCompressLogs: ${
    !ctx.sls.service.custom ||
    !ctx.sls.service.custom.enterprise ||
    ctx.sls.service.custom.enterprise.compressLogs !== false
  },
  disableAwsSpans: ${Boolean(
    ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.disableAwsSpans
  )},
  disableHttpSpans: ${Boolean(
    ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.disableHttpSpans
  )},
  stageName: '${ctx.provider.getStage()}',
  serverlessPlatformStage: '${process.env.SERVERLESS_PLATFORM_STAGE || 'prod'}',
  devModeEnabled: ${isDevMode},
  accessKey: ${isDevMode ? `'${accessKey}'` : null},
  pluginVersion: '${version}',
  disableFrameworksInstrumentation: ${Boolean(
    ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.disableFrameworksInstrumentation
  )}
});

const handlerWrapperArgs = { functionName: '${fn.name}', timeout: ${fn.timeout} };
${isDevMode ? devModeHandlerExec : standardHandlerExec}`;

  // Create new handlers
  fs.writeFileSync(path.join(ctx.sls.config.servicePath, `${fn.entryNew}.js`), newHandlerCode);
};

/*
 * Wrap python Functions
 */
const wrapPython = (fn, ctx) => {
  const newHandlerCode = `import serverless_sdk
sdk = serverless_sdk.SDK(
    org_id='${ctx.sls.service.org}',
    application_name='${ctx.sls.service.app}',
    app_uid='${ctx.sls.service.appUid}',
    org_uid='${ctx.sls.service.orgUid}',
    deployment_uid='${ctx.deploymentUid}',
    service_name='${ctx.sls.service.service}',
    should_log_meta=${
      !isLocalInvocation(ctx) &&
      _.get(ctx.sls.service.custom, ['enterprise', 'collectLambdaLogs']) !== false
        ? 'True'
        : 'False'
    },
    should_compress_logs=${
      !ctx.sls.service.custom ||
      !ctx.sls.service.custom.enterprise ||
      ctx.sls.service.custom.enterprise.compressLogs !== false
        ? 'True'
        : 'False'
    },
    disable_aws_spans=${
      ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.disableAwsSpans
        ? 'True'
        : 'False'
    },
    disable_http_spans=${
      ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.disableHttpSpans
        ? 'True'
        : 'False'
    },
    stage_name='${ctx.provider.getStage()}',
    plugin_version='${version}',
    disable_frameworks_instrumentation=${
      ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.disableFrameworksInstrumentation
        ? 'True'
        : 'False'
    },
    serverless_platform_stage='${process.env.SERVERLESS_PLATFORM_STAGE || 'prod'}'
)
handler_wrapper_kwargs = {'function_name': '${fn.name}', 'timeout': ${fn.timeout}}
try:
    user_handler = serverless_sdk.get_user_handler('${fn.entryOrig}.${fn.handlerOrig}')
    handler = sdk.handler(user_handler, **handler_wrapper_kwargs)
except Exception as error:
    e = error
    def error_handler(event, context):
        raise e
    handler = sdk.handler(error_handler, **handler_wrapper_kwargs)
`;
  // Create new handlers
  fs.writeFileSync(path.join(ctx.sls.config.servicePath, `${fn.entryNew}.py`), newHandlerCode);
};

const wrap = async (ctx) => {
  if (!shouldWrap(ctx)) {
    log.warning('Skipping Wrapping for Service');
    return;
  }
  /*
   * Prepare Functions
   */
  const { functions } = ctx.sls.service;
  ctx.state.functions = {};
  const unsupportedRuntimes = new Set();
  let hasImageFunction = false;
  for (const func of Object.keys(functions)) {
    const functionConfig = functions[func];
    if (functionConfig.image) {
      hasImageFunction = true;
      continue;
    }
    const runtime = functionConfig.runtime
      ? functionConfig.runtime
      : ctx.sls.service.provider.runtime || 'nodejs14.x';

    if (!supportedRuntime(runtime)) {
      unsupportedRuntimes.add(runtime);
      continue;
    }

    if (!shouldWrapFunction(ctx, functionConfig)) {
      log.warning(`Skipping wrapping for Function: ${func}`);
      continue;
    }

    // the default is 6s: https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/
    const timeout = functionConfig.timeout || ctx.sls.service.provider.timeout || 6;

    // Process name
    let name;
    if (functionConfig.name) {
      ({ name } = functionConfig);
    } else {
      name = `${ctx.sls.service.service}-${ctx.sls.service.provider.stage}-${func}`;
    }

    // Process handler
    const entry = functionConfig.handler.split('.').slice(0, -1).join('.');
    const handler = functionConfig.handler.split('.').slice(-1)[0];

    let extension = 'js';
    if (runtime.includes('python')) {
      extension = 'py';
    }

    ctx.state.functions[func] = {
      key: func,
      name,
      runtime,
      timeout,
      extension,
      entryOrig: entry,
      handlerOrig: handler,
      entryNew: `s_${func.replace(/-/g, '_')}`,
      handlerNew: 'handler',
    };
  }

  if (unsupportedRuntimes.size) {
    log.warning(
      `Serverless Framework observability features do not support the following runtime${
        unsupportedRuntimes.size === 1 ? '' : 's'
      }: ${Array.from(unsupportedRuntimes).join(', ')}`
    );
  }
  if (hasImageFunction) {
    log.warning(
      "Serverless Framework Dashboard doesn't support functions that reference AWS ECR images"
    );
  }

  /*
   * Wrap Functions
   */

  ctx.state.pathAssets = path.join(ctx.sls.config.servicePath, 'serverless_sdk');

  // Clear existing handler dir
  if (fs.pathExistsSync(ctx.state.pathAssets)) {
    fs.removeSync(ctx.state.pathAssets);
  }

  // Create new handler dir
  fs.ensureDirSync(ctx.state.pathAssets);

  // Copy SDK
  const vals = Object.keys(ctx.state.functions).map((key) => ctx.state.functions[key]);
  if (vals.some(({ runtime }) => supportedNodeRuntime(runtime))) {
    const pathSdk = path.resolve(__dirname, '../sdk-js/dist/index.js');
    const pathSdkDest = path.join(ctx.state.pathAssets, './index.js');
    fs.copySync(pathSdk, pathSdkDest);
  }
  if (vals.some(({ runtime }) => supportedPythonRuntime(runtime))) {
    const pathSdk = path.resolve(__dirname, '../sdk-py/serverless_sdk');
    fs.copySync(pathSdk, ctx.state.pathAssets);
  }

  // Prepare & Copy Function Handlers
  for (const fn of Object.keys(ctx.state.functions)) {
    const func = ctx.state.functions[fn];

    if (!supportedRuntime(func.runtime)) {
      continue;
    }

    // Get access key for the platform, but only for dev mode. It's needed
    // to authenticate to the platform WebSocket during runtime
    let accessKey = null;

    if (isDevMode) {
      accessKey = await getOrCreateAccessKeyForOrg(ctx.sls.service.org);
    }

    // Add the Serverless SDK wrapper around the function

    if (supportedNodeRuntime(func.runtime)) {
      wrapNodeJs(func, ctx, accessKey);
    } else if (supportedPythonRuntime(func.runtime)) {
      wrapPython(func, ctx);
    }

    // Re-assign the handler to point to the wrapper
    ctx.sls.service.functions[fn].handler = `${func.entryNew}.${func.handlerNew}`;

    if (_.get(ctx.sls.service.functions[fn], 'package.artifact')) {
      const zipData = await fs.readFile(ctx.sls.service.functions[fn].package.artifact);
      const zip = await JSZip.loadAsync(zipData);
      const wrapperData = await fs.readFile(
        path.join(ctx.sls.config.servicePath, `${func.entryNew}.${func.extension}`)
      );
      zip.file(`${func.entryNew}.${func.extension}`, wrapperData);
      await addTree(zip, 'serverless_sdk');
      await writeZip(zip, ctx.sls.service.functions[fn].package.artifact);
    } else if (
      _.get(
        ctx.sls.service.functions[fn],
        'package.individually',
        _.get(ctx.sls.service, 'package.individually', false)
      )
    ) {
      // add patterns directives for handler file & sdk lib
      if (ctx.sls.service.functions[fn].package === undefined) {
        ctx.sls.service.functions[fn].package = {};
      }
      if (ctx.sls.service.functions[fn].package.patterns === undefined) {
        ctx.sls.service.functions[fn].package.patterns = [];
      }
      ctx.sls.service.functions[fn].package.patterns.push(`${func.entryNew}.${func.extension}`);
      ctx.sls.service.functions[fn].package.patterns.push('serverless_sdk/**');
    }
  }

  if (_.get(ctx.sls.service, 'package.artifact')) {
    const zipData = await fs.readFile(ctx.sls.service.package.artifact);
    const zip = await JSZip.loadAsync(zipData);
    for (const fn of Object.keys(ctx.state.functions)) {
      const func = ctx.state.functions[fn];
      if (!supportedRuntime(func.runtime)) {
        continue;
      }
      const wrapperData = await fs.readFile(
        path.join(ctx.sls.config.servicePath, `${func.entryNew}.${func.extension}`)
      );
      zip.file(`${func.entryNew}.${func.extension}`, wrapperData);
    }
    await addTree(zip, 'serverless_sdk');
    await writeZip(zip, ctx.sls.service.package.artifact);
  }
  // add patterns directives for handler file & sdk lib
  else if (!_.get(ctx.sls.service, 'package.individually', false)) {
    let extension = 'js';
    if (supportedPythonRuntime(ctx.sls.service.provider.runtime)) {
      extension = 'py';
    }
    if (ctx.sls.service.package === undefined) {
      ctx.sls.service.package = {};
    }
    if (ctx.sls.service.package.patterns === undefined) {
      ctx.sls.service.package.patterns = [];
    }
    ctx.sls.service.package.patterns.push(`s_*.${extension}`);
    ctx.sls.service.package.patterns.push('serverless_sdk/**');
  }
};

module.exports = wrap;
