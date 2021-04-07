export const hello = (event, context, callback) => {
  const p = new Promise((resolve) => {
    resolve('success');
  });
  p.then(() =>
    callback(null, {
      message: 'Go Serverless Webpack (Ecma Script) v1.0! First module!',
      event,
    })
  ).catch((e) => callback(e));
};
