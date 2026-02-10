"""
Internal Lookup Lambda function - exposed as a private Gateway tool.

This function simulates an internal user lookup service that requires
authentication. In a real scenario, this might query an internal database
or API with sensitive user information.
"""

import json


# Simulated internal user database
USERS = {
    "USR001": {
        "id": "USR001",
        "name": "Alice Johnson",
        "email": "alice.johnson@company.internal",
        "department": "Engineering",
        "role": "Senior Developer",
        "location": "San Francisco"
    },
    "USR002": {
        "id": "USR002",
        "name": "Bob Smith",
        "email": "bob.smith@company.internal",
        "department": "Product",
        "role": "Product Manager",
        "location": "New York"
    },
    "USR003": {
        "id": "USR003",
        "name": "Carol Williams",
        "email": "carol.williams@company.internal",
        "department": "Engineering",
        "role": "Tech Lead",
        "location": "Seattle"
    },
    "USR004": {
        "id": "USR004",
        "name": "David Brown",
        "email": "david.brown@company.internal",
        "department": "Security",
        "role": "Security Engineer",
        "location": "Austin"
    },
}


def handler(event, context):
    """
    Lambda handler for internal user lookup tool.

    This tool is protected by AWS_IAM authorization on the gateway,
    ensuring only authenticated callers can access internal user data.

    Expected input:
    {
        "userId": "USR001"
    }

    Returns user information or error if not found.
    """
    print(f"Internal lookup invoked with event: {json.dumps(event)}")

    if isinstance(event, str):
        event = json.loads(event)

    # Gateway may wrap the input in a 'body' field
    if 'body' in event:
        body = event['body']
        if isinstance(body, str):
            body = json.loads(body)
        user_id = body.get('userId', '')
    else:
        user_id = event.get('userId', '')

    if not user_id:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Missing userId parameter'
            })
        }

    # Look up user
    user = USERS.get(user_id.upper())

    if not user:
        return {
            'statusCode': 404,
            'body': json.dumps({
                'error': f'User not found: {user_id}',
                'availableUsers': list(USERS.keys())
            })
        }

    print(f"Found user: {user['name']}")

    return {
        'statusCode': 200,
        'body': json.dumps({
            'user': user,
            'message': f"Found user {user['name']} in {user['department']} department"
        })
    }
