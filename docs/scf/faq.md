# Frequently Asked Questions

## How is Serverless Container Framework different from Serverless Framework?

Serverless Framework has historically focused on AWS Lambda deployment — and it is the best in class at it. If you're looking for a tool that specializes in AWS Lambda use-cases (e.g. APIs, event-driven architectures, Step Functions) and has a large ecosystem of plugins expanding those capabilities, Serverless Framework is your best choice. While it offers some container support, this isn't its core focus.

Serverless Container Framework (SCF) takes a fundamentally different approach by embracing containers as the deployment artifact. This brings several key advantages:

- **Cross-Provider Deployment**: Deploy to different compute services and cloud providers without being an expert in each one
- **Consistent Experience**: Use the same development and deployment workflow everywhere
- **No Re-architecting**: Move your containerized applications between providers without changing your code
- **Container Ecosystem**: Leverage the rich container tooling and practices you already know

While SCF and Serverless Framework share some common ground, SCF's focus on container portability and provider-agnostic deployments sets it on a distinct path. It maintains all the convenience of serverless while adding the flexibility and portability that containers provide.

## Why does the Serverless Container Framework need to exist?

We built the Serverless Container Framework in response to a clear need from our Serverless Framework customers. Many have high-volume AWS Lambda functions they need to migrate—whether to reduce costs, improve performance, or access features that Lambda doesn't support. While AWS Lambda is excellent for prototyping and rapid scaling, it left many wondering: what comes after that? The serverless story felt incomplete.

Further, we observed that serverless architectures often struggle to integrate with organizations' main workflows, largely because enterprise standards are built around containers—an area where AWS Lambda has historically fallen short.

Now, with recent performance improvements in container support on AWS Lambda, we believe the time is right for a new container deployment tool that fully embraces containers as the deployment artifact and leverages the rich container ecosystem.

## How much does Serverless Container Framework cost?

Serverless Container Framework follows Serverless Inc's Customer & License Agreement, making it free for developers and organizations earning less than $2 million USD in gross revenue per year. For organizations exceeding this revenue threshold, a credit-based pricing model is currently in effect, where a credit is charged for each deployed container per month.

For clarity, Serverless Inc does not charge for 1) individual users, 2) usage (e.g. requests served, or compute used, like a hosting provider), 3) invidividual CLI actions (e.g. each time you run "deploy"). Instead, the credit price is a fixed price for a container that has been in a deployed state for longer than 10 days within a current month. The 10 day timeframe allows many testing/preview deployed instances to be created without any cost.

## How does Serverless Container Framework compare to other container deployment tools?

There are lots of tools for deploying containers (Terraform, Pulumi, etc.), but they only give you pieces, requiring you to assemble (and maintain!) a rich deployment and development experience.

While that's great for a lot of infra, for your core compute development experience, we feel developers need more.

What we do at Serverless Inc is offer exceptional infrastructure-as-code experiences for critical use-cases. We go beyond basic deploy/remove operations to provide the advanced automation developers need. SCF features a rich development mode that emulates cloud compute locally, with a local API that matches AWS Application Load Balancer behavior, real-time log streaming, hot module reloading, and zero-downtime switching between AWS Lambda and ECS Fargate.

## What are the downsides of Serverless Container Framework?

If you're coming from AWS Lambda, some of the downsides are:

- **Longer deployment times**: Container deployments take longer than function deployments for two reasons:
  - Container images are larger than function packages
  - AWS Fargate requires additional infrastructure setup for safe deployments

- **Request/Response limitations for AWS Lambda and AWS ALB**: AWS Lambda configured to AWS Application Load Balancer has a 1MB payload limit on request and response sizes (this includes headers). While compression can help, you'll need to architect your application with these limits in mind. We're actively working with AWS to advocate for higher limits, and are very optimistic that this will be addressed in the near future.

- **Lack of streaming response support for AWS Lambda and AWS ALB**: AWS Lambda and AWS ALB do not support streaming responses. This means that if your application attempts to stream a response, ALB will await the whole response before sending any data to the client.

If you're coming from other container deployment tools, the main consideration is maturity. As a newer solution in this space, we're continuously evolving. However, we believe our developer experience already surpasses existing tools, offering unique features like local cloud emulation, real-time logs, and seamless Lambda/ECS switching.
