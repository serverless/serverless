import requests

def hello(event, context):
    return {
        'statusCode': 200,
        'body': 'Individual function with requests'
    }
