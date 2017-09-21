# Implement your function here.
# The function will get the request as parameter.
# The function should return an object


def main(args):
    queryparams = args.get("query", {})
    body = args.get("body", {})

    return {
        'statusCode': 200,
        'body': '{"hello":"from Python2.7 function"}',
        'headers': {"Content-Type": "application/json"}
    }
