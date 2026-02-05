<!--
title: Custom Domains
description: Easily configure custom domains for your APIs with the Serverless Framework.
short_title: Domains
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'API Gateway',
    'Custom Domains',
    'Route53',
    'ACM',
    'SSL Certificates',
  ]
-->

# Custom Domains

The Serverless Framework v4 provides built-in support for configuring custom domains for your APIs. This feature automatically handles SSL certificate creation, Route53 DNS configuration, and API Gateway domain mapping.

> **Acknowledgement:**  
> Big shout out to [Amplify Education](https://amplify.com/) for creating and maintaining [the original Serverless Domain Manager plugin](https://github.com/amplify-education/serverless-domain-manager). The custom domains feature in the Serverless Framework v4 was made possible thanks to their hard work and contributions to the community.

## Quick Start

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  domain: api.example.com

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /
          method: get
```

```bash
serverless deploy
```

### Notes:

- If your domain is registered and managed in Route53, the Framework will automatically handle domain setup, SSL certificate creation, and DNS configuration for you. If your domain is registered with a third-party registrar, you can still use it—just follow the [Third-Party Registrar Setup](#third-party-registrar-setup) instructions to complete a few manual DNS steps.
- After deployment, it may take 2-5 minutes for your custom domain to become fully accessible due to DNS propagation and SSL certificate activation.

## Usage

### Basic Usage

#### Single Domain

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  domain: api.example.com

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /
          method: get
```

#### Multiple Stages

```yaml
# serverless.yml
service: my-service

params:
  dev:
    domain: api.example.dev
  prod:
    domain: api.example.com

provider:
  name: aws
  runtime: nodejs20.x
  domain: ${param:domain}

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /
          method: get
```

#### Multiple Domains

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  domains:
    - api.example.com
    - api-v2.example.com

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /
          method: get
```

### Advanced Usage

```yaml
service: your-service
provider:
  name: aws
  runtime: nodejs20.x
  domain:
    name: api.example.com
    basePath: v1
    apiType: http
    endpointType: regional

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /users
          method: get

  websocket:
    handler: src/websocket.handler
    events:
      - websocket:
          route: $connect
```

## Domain Configuration Options

### String Format (Simple)

For basic setups, you can specify a domain as a simple string:

```yaml
provider:
  domain: api.example.com
```

### Object Format (Advanced)

For more control, use the object format:

```yaml
provider:
  domain:
    name: api.example.com # Required: Your custom domain name
    basePath: v1 # Optional: Base path for API mapping
    apiType: http # Optional: API type (http, rest, websocket)
    endpointType: regional # Optional: Endpoint type (regional, edge)
```

### Multiple Domains

You can configure multiple domains for the same service:

```yaml
provider:
  domains:
    - name: api.example.com
      apiType: http
      basePath: v1
    - name: api-staging.example.com
      apiType: http
      basePath: v1
    - name: websocket.example.com
      apiType: websocket
```

## Configuration Reference

Below are all available configuration options for custom domains:

| Option                         | Type           | Required | Description                                                                                                                                                                                                                     |
| ------------------------------ | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                         | string         | Yes      | Your custom domain name (e.g., `api.example.com`)                                                                                                                                                                               |
| `basePath`                     | string         | No       | Base path for API mapping (e.g., `v1`, `api`)                                                                                                                                                                                   |
| `apiType`                      | string         | No       | API type: `http`, `rest`, or `websocket`. Defaults to `http`. Please note that Serverless Framework Services can only have 1 of each API Type. Therefore, when you specify `apiType` it will be auto-mapped to the correct one. |
| `endpointType`                 | string         | No       | Endpoint type: `regional` or `edge`. Defaults to `regional`                                                                                                                                                                     |
| `certificateArn`               | string         | No       | ARN of existing ACM certificate. If not provided, a new certificate will be created                                                                                                                                             |
| `certificateName`              | string         | No       | Name of existing ACM certificate to use instead of creating a new one                                                                                                                                                           |
| `createRoute53Record`          | boolean        | No       | Whether to create Route53 DNS records. Set to `false` for third-party registrars. Defaults to `true`                                                                                                                            |
| `createRoute53IPv6Record`      | boolean        | No       | Whether to create IPv6 (AAAA) Route53 records. Defaults to `true`                                                                                                                                                               |
| `hostedZoneId`                 | string         | No       | Route53 hosted zone ID. If not provided, will be automatically detected                                                                                                                                                         |
| `hostedZonePrivate`            | boolean        | No       | Whether to use a private hosted zone. Defaults to `false`                                                                                                                                                                       |
| `route53Profile`               | string         | No       | AWS profile to use for Route53 operations                                                                                                                                                                                       |
| `route53Region`                | string         | No       | AWS region for Route53 operations                                                                                                                                                                                               |
| `route53Params`                | object         | No       | Additional parameters to pass to Route53 API calls                                                                                                                                                                              |
| `splitHorizonDns`              | boolean        | No       | Enable split-horizon DNS for private hosted zones                                                                                                                                                                               |
| `securityPolicy`               | string         | No       | Security policy for the domain (e.g., `TLS_1_2`)                                                                                                                                                                                |
| `tlsTruststoreUri`             | string         | No       | S3 URI of the truststore for mutual TLS authentication                                                                                                                                                                          |
| `tlsTruststoreVersion`         | string         | No       | Version of the TLS truststore                                                                                                                                                                                                   |
| `enabled`                      | boolean/string | No       | Whether the domain is enabled. Can be a boolean or a condition string                                                                                                                                                           |
| `allowPathMatching`            | boolean        | No       | Allow path-based routing for the domain                                                                                                                                                                                         |
| `preserveExternalPathMappings` | boolean        | No       | Preserve existing path mappings not managed by Serverless Framework                                                                                                                                                             |

### Example with Advanced Configuration

```yaml
provider:
  name: aws
  runtime: nodejs20.x
  domain:
    name: api.example.com
    basePath: v1
    apiType: http
    endpointType: regional
    certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
    createRoute53Record: true
    createRoute53IPv6Record: true
    hostedZoneId: Z1PA6795UKMFR9
    securityPolicy: TLS_1_2
    enabled: true
    allowPathMatching: false
    preserveExternalPathMappings: false
    route53Params:
      TTL: 300
      Comment: 'Custom domain for API'

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /users
          method: get
```

## API Types

The Serverless Framework supports different API types for custom domains:

### HTTP API (Default)

```yaml
service: my-service

provider:
  domain:
    name: api.example.com
    apiType: http

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /
          method: get
```

### REST API

```yaml
service: my-service

provider:
  domain:
    name: api.example.com
    apiType: rest

functions:
  hello:
    handler: src/hello.handler
    events:
      - http:
          path: /
          method: get
```

### WebSocket API

```yaml
service: my-service

provider:
  domain:
    name: websocket.example.com
    apiType: websocket

functions:
  connect:
    handler: src/websocket.connect
    events:
      - websocket:
          route: $connect

  disconnect:
    handler: src/websocket.disconnect
    events:
      - websocket:
          route: $disconnect

  default:
    handler: src/websocket.default
    events:
      - websocket:
          route: $default
```

## Base Path Mapping

You can configure a base path to map your API to a specific path on your domain:

```yaml
service: my-service

provider:
  domain:
    name: api.example.com
    basePath: v1

functions:
  users:
    handler: src/users.handler
    events:
      - httpApi:
          path: /users
          method: get
```

This configuration will make your API available at `https://api.example.com/v1/users`.

## Endpoint Types

### Regional (Recommended)

Regional endpoints are optimized for requests from the same AWS region:

```yaml
provider:
  domain:
    name: api.example.com
    endpointType: regional
```

### Edge

Edge endpoints use CloudFront for global distribution:

```yaml
provider:
  domain:
    name: api.example.com
    endpointType: edge
```

## Multiple Domain Configurations

For complex applications, you can configure different domains for different purposes:

```yaml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  domains:
    - name: api.example.com
      apiType: http
      basePath: v1
    - name: websocket.example.com
      apiType: websocket
    - name: admin.example.com
      apiType: rest
      basePath: admin

functions:
  # HTTP API functions
  getUsers:
    handler: src/users.get
    events:
      - httpApi:
          path: /users
          method: get

  # WebSocket functions
  connect:
    handler: src/websocket.connect
    events:
      - websocket:
          route: $connect

  # REST API functions
  adminPanel:
    handler: src/admin.panel
    events:
      - http:
          path: /dashboard
          method: get
```

## Prerequisites

### Route53 Hosted Zone

Your domain must have a Route53 hosted zone configured in your AWS account. The Serverless Framework will automatically:

1. Create an ACM SSL certificate for your domain
2. Validate the certificate using DNS validation
3. Create the necessary Route53 DNS records
4. Map the domain to your API Gateway

### Domain Ownership

You must own the domain and have it configured with Route53 as the DNS provider.

## Third-Party Registrar Setup

If your domain is registered with a third-party registrar (not Route53), you'll need to manually create and configure the SSL certificate and DNS records.

### Step 1: Create SSL Certificate Manually

1. Go to AWS Certificate Manager (ACM) in your AWS console
2. Request a new certificate for your domain
3. Choose DNS validation method
4. Add the validation CNAME records to your domain registrar's DNS settings
5. Wait for the certificate to be validated and issued
6. Copy the certificate ARN

### Step 2: Configure Serverless Framework

Use the certificate ARN and disable automatic Route53 record creation:

```yaml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  domain:
    name: api.example.com
    certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
    createRoute53Record: false
    apiType: http
    endpointType: regional

functions:
  hello:
    handler: src/hello.handler
    events:
      - httpApi:
          path: /
          method: get
```

### Step 3: Create DNS Records Manually

After deploying your service, you'll need to create DNS records in your registrar:

1. Deploy your service: `serverless deploy`
2. Note the API Gateway domain name from the deployment output
3. In your registrar's DNS settings, create:
   - **Type**: CNAME (or A/AAAA if using alias records)
   - **Name**: Your subdomain (e.g., `api` for `api.example.com`)
   - **Value**: The API Gateway domain name (e.g., `d-1234567890.execute-api.us-east-1.amazonaws.com`)

### Configuration Options for Third-Party Registrars

| Option                | Required | Description                                                 |
| --------------------- | -------- | ----------------------------------------------------------- |
| `certificateArn`      | Yes      | ARN of the manually created ACM certificate                 |
| `createRoute53Record` | Yes      | Set to `false` to prevent automatic Route53 record creation |
| `name`                | Yes      | Your custom domain name                                     |
| `apiType`             | No       | API type (http, rest, websocket) - defaults to http         |
| `endpointType`        | No       | Endpoint type (regional, edge) - defaults to regional       |
| `basePath`            | No       | Base path for API mapping                                   |

### Example with Multiple Domains

```yaml
provider:
  name: aws
  runtime: nodejs20.x
  domains:
    - name: api.example.com
      certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/api-cert-12345
      createRoute53Record: false
      apiType: http
    - name: websocket.example.com
      certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/ws-cert-12345
      createRoute53Record: false
      apiType: websocket
```

## SSL Certificates

The Serverless Framework automatically handles SSL certificate creation and validation:

- **Certificate Creation**: ACM certificates are automatically created for your domains
- **DNS Validation**: Certificate validation is performed using Route53 DNS records
- **Auto-Renewal**: ACM handles certificate renewal automatically

## Deployment Process

When you deploy a service with custom domains, the framework will:

1. **Create API Gateway**: Deploy your API Gateway (HTTP API, REST API, or WebSocket API)
2. **Request Certificate**: Create an ACM certificate for your domain
3. **DNS Validation**: Add DNS validation records to Route53
4. **Domain Mapping**: Create the custom domain in API Gateway
5. **Route Configuration**: Add Route53 A/AAAA records pointing to the API Gateway

## Limitations

- Custom domains are only supported for services deployed to AWS
- Your domain must be managed by Route53
- Certificate validation can take several minutes
- Edge endpoint custom domains require certificates in the `us-east-1` region

## Troubleshooting

### Certificate Validation Issues

If certificate validation fails:

1. Ensure your domain has a Route53 hosted zone
2. Verify DNS propagation using tools like `dig` or `nslookup`
3. Check that the validation records were created correctly

### Domain Not Accessible

If your domain is not accessible after deployment:

1. Wait for DNS propagation (can take up to 48 hours)
2. Verify the Route53 records were created
3. Check API Gateway domain configuration
4. Ensure your functions are deployed correctly

### Multiple Region Deployments

When deploying to multiple regions with the same domain:

1. Use regional endpoints to avoid conflicts
2. Consider using different subdomains per region
3. Use Route53 routing policies for traffic distribution
