'use strict';

module.exports.printMessage = async function (context, blob) {
  const content = JSON.parse(blob);

  context.log("================= MESSAGE START =================")
  context.log('Blob name: ', context.bindingData.blobName);
  context.log('Blob length: ', blob.length, ' bytes');

  // NOTE: expecting blob to be a json file
  context.log('Blob content:', JSON.stringify(content, null, 2));

  context.log("================= MESSAGE END =================")

  context.done();
};

