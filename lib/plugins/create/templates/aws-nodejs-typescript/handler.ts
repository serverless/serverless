import { Handler, Callback, Context } from 'aws-lambda';

export const hello : Handler = (event, context : Context, cb : Callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless Webpack (Typescript) v1.0! Your function executed successfully!',
      input: event,
    }),
  };

  cb(null, response);
}