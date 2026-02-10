/**
 * Internal Lookup Lambda function - exposed as a private Gateway tool.
 *
 * Simulates an internal user lookup service that requires authentication.
 */

// Simulated internal user database
const USERS = {
  USR001: {
    id: 'USR001',
    name: 'Alice Johnson',
    email: 'alice.johnson@company.internal',
    department: 'Engineering',
    role: 'Senior Developer',
    location: 'San Francisco',
  },
  USR002: {
    id: 'USR002',
    name: 'Bob Smith',
    email: 'bob.smith@company.internal',
    department: 'Product',
    role: 'Product Manager',
    location: 'New York',
  },
  USR003: {
    id: 'USR003',
    name: 'Carol Williams',
    email: 'carol.williams@company.internal',
    department: 'Engineering',
    role: 'Tech Lead',
    location: 'Seattle',
  },
  USR004: {
    id: 'USR004',
    name: 'David Brown',
    email: 'david.brown@company.internal',
    department: 'Security',
    role: 'Security Engineer',
    location: 'Austin',
  },
}

export const handler = async (event) => {
  console.log(`Internal lookup invoked with event: ${JSON.stringify(event)}`)

  if (typeof event === 'string') {
    event = JSON.parse(event)
  }

  let userId = ''

  if (event.body) {
    const body =
      typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    userId = body.userId || ''
  } else {
    userId = event.userId || ''
  }

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing userId parameter' }),
    }
  }

  const user = USERS[userId.toUpperCase()]

  if (!user) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: `User not found: ${userId}`,
        availableUsers: Object.keys(USERS),
      }),
    }
  }

  console.log(`Found user: ${user.name}`)

  return {
    statusCode: 200,
    body: JSON.stringify({
      user,
      message: `Found user ${user.name} in ${user.department} department`,
    }),
  }
}
