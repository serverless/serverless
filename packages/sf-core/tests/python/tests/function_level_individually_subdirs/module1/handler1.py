import requests

def hello(event, context):
    return {
        'statusCode': 200,
        'body': 'Function 1 in module1 with requests'
    }
