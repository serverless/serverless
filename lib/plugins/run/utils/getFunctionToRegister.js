'use strict';


function getFunctionToRegister(serviceName, functionName, emulatorUrl) {
  const functionId = `${serviceName}-${functionName}`;

  const functionObject = {
    functionId,
    provider: {
      type: 'emulator',
      emulatorUrl,
      apiVersion: 'v0',
    },
  };

  return functionObject;
}

module.exports = getFunctionToRegister;
