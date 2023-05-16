export const handler = async (event, context) => {
  if (event && event.shouldFail) throw new Error('Failed on request');
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Invoked',
      event,
      clientContext: context.clientContext,
      env: process.env,
    }),
  };
};

export default handler;
