const { hello } = require('./handler');

test('hello - should respond with `hello`', () => {
  const event = 'hello';
  const callback = jest.fn();
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
    }),
  };

  hello(event, null, callback);
  expect(callback).toHaveBeenCalledWith(null, response);
});
