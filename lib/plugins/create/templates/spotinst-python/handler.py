
 # Implement your function here.
 # The function will get the event as the first parameter with query/body properties:
 # The function should return a Dictionary

def main(event, context):
    queryparams = event.get("query", {})
    body = event.get("body", {})

    return {
        'statusCode': 200,
        'body': '{"hello":"from Python2.7 function"}',
        'headers': {"Content-Type": "application/json"}
    }