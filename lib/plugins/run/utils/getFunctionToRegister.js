'use strict';


function getFunctionToRegister(serviceName, functionName, localEmulatorRootUrl) {
  const functionId = `${serviceName}-${functionName}`;
  const invokeFunctionUrl = `${localEmulatorRootUrl
  }/v0/emulator/api/invoke/${serviceName}/${functionName}`;

  const functionObject = {
    functionId,
    provider: {
      type: 'http',
      url: invokeFunctionUrl,
    },
  };

  return functionObject;
}

module.exports = getFunctionToRegister;
