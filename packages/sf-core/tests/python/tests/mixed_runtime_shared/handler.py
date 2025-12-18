import requests

def hello(event, context):
    return {
        'statusCode': 200,
        'body': 'Python function with requests'
    }


