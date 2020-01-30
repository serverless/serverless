import { AzureFunction, Context, HttpRequest } from '@azure/functions';

const sayGoodbye: AzureFunction = async function (context: Context, req: HttpRequest) {
  context.log('Typescript HTTP trigger function processed a request.');

  if (req.query.name || (req.body?.name)) {
    context.res = {
      // status: 200, /* Defaults to 200 */
      body: `Goodbye ${(req.query.name || req.body.name)}`,
    };
  } else {
    context.res = {
      status: 400,
      body: 'Please pass a name on the query string or in the request body',
    };
  }
};

module.exports.sayGoodbye = sayGoodbye;