import requests


def hello(event, context):
    return requests.get('https://httpbin.org/get').json()
