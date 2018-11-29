require 'json'

def hello(event:, context:)
  {
    statusCode: 200,
    body: JSON.generate({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
    }),
  }

  # Use this code if you don't use the http event with the LAMBDA-PROXY integration
  # return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
end
