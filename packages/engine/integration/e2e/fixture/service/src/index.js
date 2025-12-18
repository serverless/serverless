const express = require('express')
const path = require('path')
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3')
const app = express()
const port = 8080

// Initialize S3 client
const s3Client = new S3Client({})

/**
 * Midddleware
 */

app.use((req, res, next) => {
  // Enable CORS
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('x-powered-by', 'serverless-container-framework')
  next()
})

/**
 * Routes
 */

app.options(`*`, (req, res) => {
  res.status(200).send()
})

// Healthcheck
app.get(`/health`, (req, res) => {
  res.status(200).send(`OK`)
})

app.get('/info', (req, res) => {
  res.json({
    platform: process.env.SERVERLESS_COMPUTE_TYPE,
    env: {
      SERVERLESS_NAMESPACE: process.env.SERVERLESS_NAMESPACE,
      SERVERLESS_STAGE: process.env.SERVERLESS_STAGE,
      SERVERLESS_CONTAINER_NAME: process.env.SERVERLESS_CONTAINER_NAME,
      SERVERLESS_COMPUTE_TYPE: process.env.SERVERLESS_COMPUTE_TYPE,
      SERVERLESS_ROUTING_PATH_PATTERN:
        process.env.SERVERLESS_ROUTING_PATH_PATTERN,
      SERVERLESS_LOCAL: process.env.SERVERLESS_LOCAL,
    },
  })
})

app.get('/s3/buckets', async (req, res) => {
  try {
    const command = new ListBucketsCommand({})
    const { Buckets } = await s3Client.send(command)

    res.json({
      buckets: Buckets.map((bucket) => ({
        name: bucket.Name,
        creationDate: bucket.CreationDate,
      })),
    })
  } catch (error) {
    console.error('Error listing S3 buckets:', error)
    res.status(500).json({
      error: 'Failed to list S3 buckets',
      message: error.message,
    })
  }
})

/**
 * Error Handler
 */
app.use((err, req, res, next) => {
  console.log(err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    message: err.message || 'Internal Server Error',
    code: err.code || 'internal_error',
    status: err.status,
    // stack: err.stack - Don't include stack trace
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`App initialized`)
})
