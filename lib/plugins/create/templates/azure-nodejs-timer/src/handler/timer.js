'use strict';

module.exports.printMessage = async function (context, req) {
  context.log("================= MESSAGE START =================")

  context.log('JavaScript Timer trigger function processed a request.');
  context.log(`Timer ran @ ${new Date()}`);

  context.log("================= MESSAGE END =================")

  context.done();
};
