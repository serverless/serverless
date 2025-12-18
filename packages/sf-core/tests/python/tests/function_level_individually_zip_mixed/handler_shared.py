import requests

def hello(event, context):
    return {
        'statusCode': 200,
        'body': 'Shared function with requests'
    }
