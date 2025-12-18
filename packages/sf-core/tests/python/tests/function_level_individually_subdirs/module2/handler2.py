import requests

def hello(event, context):
    return {
        'statusCode': 200,
        'body': 'Function 2 in module2 with requests'
    }
