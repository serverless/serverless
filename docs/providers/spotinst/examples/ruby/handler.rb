
# Implement your function here.
# The function will get the request as parameter.
# The function should return an Hash

def main(args)
    queryparams = args["query"]
    body = args["body"]

    {
        :statusCode => 200,
        :body => '{"hello":"from Ruby2.4.1 function"}'
    }
end