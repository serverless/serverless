
 # Implement your function here.
 # The function will get the event as the first parameter with query/body properties:
 # The function should return an Hash

def main(event, context)
    queryparams = event["query"]
    body = event["body"]

    {
        :statusCode => 200,
        :body => '{"hello":"from Ruby2.4.1 function"}'
    }
end