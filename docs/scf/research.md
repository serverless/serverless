---
title: Serverless Container Framework - Research & Analysis
short_title: Research & Analysis
description: >-
  In-depth analysis of serverless container performance, costs, and operational
  characteristics.  Compare AWS Lambda, AWS Fargate, and Google Cloud Run with
  detailed benchmarks and optimization  strategies.
keywords:
  - Serverless Containers
  - Serverless Container Framework
  - AWS Lambda Container Guide
  - AWS Fargate Container Guide
  - Google Cloud Run Container Guide
  - Container Performance
  - Serverless Analysis
  - Cost Analysis
  - AWS Lambda Research
  - Fargate Performance
  - Cloud Run Analysis
  - Container Benchmarks
  - Performance Testing
  - Cost Optimization
  - Cloud Computing Research
  - Serverless Comparison
  - Container Metrics
  - Cloud Platform Analysis
  - Performance Optimization
  - Cost Efficiency
---

# Research On Serverless Containers

This research analyzes the performance, cost, and operational characteristics of running containers on serverless and Functions-as-a-Service (FaaS) compute platforms.

The findings inform the goals and design of the **Serverless Container Framework (SCF)**, which aims to solve a critical challenge: enabling applications to seamlessly transition between different serverless platforms based on cost and performance requirements.

SCF treats containers as the universal deployment unit, providing a consistent way to package and run applications across Functions as a Service (FaaS) and other serverless compute options. This container-centric approach enables workloads to move freely between platforms while maintaining serverless benefits like automatic scaling and pay-per-use pricing.

## History of Serverless Packaging

The evolution of serverless compute platforms shows the industry's progression from simple deployments to sophisticated container-based solutions:

**2014-2016: Early Serverless Era**

- AWS Lambda launches with zip-only deployments (50MB limit)
- Azure Functions debuts (2016) with zip deployment support
- Google Cloud Functions releases with source-code uploads
- AWS Elastic Beanstalk adds Docker support (2014)
- Google App Engine adds Flexible Environment with container support (2016)

**2017-2019: Maturation & Container Adoption**

- AWS Lambda increases zip limit to 250MB
- Azure Functions adds custom handlers for language flexibility
- Google Cloud Functions adds layer support for dependency management
- AWS Fargate launches (2017) with container-native compute
- Azure Container Instances (ACI) debuts (2017)
- Google Cloud Run launches in beta (2019)
- Knative 1.0 releases, offering a Kubernetes-native serverless platform

**2020-2021: Container Revolution**

- AWS Lambda adds container image support (Dec 2020, 10GB limit)
- Azure Functions introduces container deployment (late 2020, 10GB limit)
- Digital Ocean Functions launches with container-first approach via OpenFaaS
- Google Cloud Run becomes generally available
- AWS App Runner launches (2021) with container-native PaaS

**2022-Present: Container Optimization & Platform Convergence**

- Google Cloud Functions 2nd Gen debuts with container support (2022)
- AWS introduces on-demand container loading and efficient caching, dramatically improving performance of containerized functions
- Azure integrates tighter container orchestration with Kubernetes
- All major platforms standardize on container support
- Red Hat OpenShift Serverless extends Knative support
- Platform teams adopt container-based deployment as standard
- Edge computing platforms gain prominence with container support

**Current Platform Capabilities:**

| Platform                  | Primary Package Format | Size Limit | Container Support |
| ------------------------- | ---------------------- | ---------- | ----------------- |
| AWS Lambda                | Zip/Container          | 10GB       | Native + Custom   |
| Azure Functions           | Zip/Container          | 10GB       | Native + Custom   |
| Google Functions          | Zip/Container          | 32GB       | Native + Custom   |
| AWS Fargate               | Container              | 10GB       | Native            |
| Google Cloud Run          | Container              | 32GB       | Native            |
| Azure Container Apps      | Container              | 10GB       | Native            |
| DO Functions              | Container              | 10GB       | Container-only    |
| AWS App Runner            | Container              | 10GB       | Native            |
| Azure Container Instances | Container              | No limit\* | Native            |

\*Subject to quota limits

This evolution demonstrates the industry's convergence on containers as the standard deployment unit for serverless compute, enabling greater workload portability and operational consistency across platforms.

### Fargate

AWS Fargate is a serverless container management service that differs from AWS Lambda in several ways:

- **Execution**:
  - Lambda: Managed, auto-scaled functions.
  - Fargate: Customizable container environment, with scaling and load balancing managed by you.
- **Pricing**:
  - Lambda: Per-invocation billing, with costs based on the number of invocations, execution time and memory allocated
    to your functions. Pricing granularity is 1ms.
  - Fargate: Pay for resources, with costs based on the CPU and memory resources you allocate to your containers.
    Pricing granularity is 1 second (minimum 1 minute).
- **Resource Control**:
  - Lambda: Limited control over CPU and memory resources.
  - Fargate: Full control over CPU and memory resources.

AWS Fargate offers container-specific advantages and greater customization compared to AWS Lambda, making it a choice
when you need more control over containerized applications and specific workloads.

### Lambda Containers Cold Starts

Cold starts are a common issue with serverless functions. When a function is invoked, the platform must start a
container to run the function code. While you provide the code, the platform is responsible for managing the container.
This way, the only moving part is the code, so cold starts can be rapid. Consider what happens when you use a container
image as a deployment package. The platform must download the image, extract it, and start the container. This may seem
like a lot of work because the image needs to contain the runtime in addition to your code. Let's see how this works in
practice.

#### Benchmark Setup

Let's use three different Node.js apps to compare the cold start performance of Lambda containers:

1. **Hello World**: A simple app with no dependencies, just a single function. Compressed code size is just 300 bytes.
2. **Small API**: An app with a few dependencies. `node_modules` size is 37 MB, compressed code size is 9.6 MB.
3. **Large API**: An app with many dependencies. `node_modules` size is 203 MB, compressed code size is 40.2 MB.

Each app has a single `handler` function that returns a JSON response with a hardcoded message.
To make sure all dependencies are loaded, we require all of them in `index.js`.
This way, we can measure the time it takes to load all dependencies and start the function.

To see if containerized functions are slower than traditional Lambda functions,
we'll compare the traditional ZIP archive deployment with the container image deployment.
Also, we'll compare different base container images.
We'll use the following images that differ in size:

1. **AWS Base Image for Lambda**: `amazon/aws-lambda-nodejs:18`
2. **Official Node.js Slim Image**: `node:18-buster-slim`
3. **Distroless Image**: `gcr.io/distroless/nodejs:18`

![Compressed Code/Image Size](docs/images/compressed-code:image-size.svg)

For each benchmark, we'll perform 50 cold starts and measure the average initialization time, using the values from the
AWS Lambda REPORT log line.

##### Does Container Image Size Matter?

![Does Container Image Size Matter?](docs/images/does-the-container-image-size-matter.svg)

As you can see, the container image size has a significant impact on cold start times.
Additionally, the larger the image, the longer it takes to initialize the function, but the difference is not
substantial. In the case of large APIs, the cold start of container function versions is even quicker than the
traditional ZIP archive deployment.

##### Does Memory Size Matter?

![Does Memory Size Matter?](docs/images/does-the-memory-size-matter.svg)

Increasing the memory size does not appear to have a substantial impact on cold start times. Please note that we're not
performing any CPU or memory intensive work in the initialization phase, so the CPU/memory allocation may not have a
significant impact. If you're executing some more code during initialization, you may observe different results.

##### Does Way of Starting the App Matter?

The way you initiate your application can also influence cold start times. Following the [official AWS Lambda
documentation](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-image.html#nodejs-image-clients), you should set the
entry point to the runtime interface client using the following command:

```bash
# Set runtime interface client as default command for the container runtime
ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]
# Pass the name of the function handler as an argument to the runtime
CMD ["index.handler"]
```

However, this command is not optimized for cold starts. `npx` is a tool that allows you to run Node.js apps without
installing them. It downloads the app and its dependencies to a temporary directory and runs it from there. Even if the
runtime interface client is already installed in the base image, `npx` checks if there's a newer version. Because of
this,
it takes around 1 second longer to start the app. To save this time, you can use the following configuration:

```bash
# Set runtime interface client as default command for the container runtime
ENTRYPOINT ["node_modules/.bin/aws-lambda-ric"]
# Pass the name of the function handler as an argument to the runtime
CMD ["index.handler"]
```

This way, you're directly using the runtime interface client installed in the `node_modules` directory.
The following chart shows the difference in cold start times for the Large API:

![Does Way of Starting the App Matter?](docs/images/does-the-way-of-starting-the-app-matter.svg)

##### Does Minification of Code Matter?

Minification is a common practice to reduce the size of your code. It's especially useful for frontend apps,
where you can use tools like [Esbuild](https://esbuild.github.io/) to minify your code.
It's not so common for backend apps, but it's still possible to minify your code.
If we already know that the container image size matters, it's reasonable to think that minifying the code can help.
Let's see if this is true.
We'll use the Large API with Distroless image for this benchmark and minify the code using Esbuild:

```bash
npx esbuild index.js --bundle --platform=node --target=node18 --bundle --minify --outdir=dist
```

![Does Minification of the Code Matter?](docs/images/does-the-minification-of-the-code-matter.svg)

As you can see, minifying the code reduced the compressed image size by 34%! Now the compressed image size is just 58.88
MB, which is not far from the size of the .zip archive of the Large API code (40.2 MB). However, when we tried to run
the function using the default memory setting (128 MB), it turned out that it couldn't be initialized due to the
initialization timeout (10 seconds). It appears that Node needs more memory to run the container with minified code.
Consequently, we had to increase the function memory size to 512 MB. Let's see how this image performs compared to the
original one.

![Does Minification of the Code Matter? (512 MB)](docs/images/does-the-minification-of-the-code-matter-cold-start.svg)

The results are impressive!
The cold start time is reduced by 41% (to just 1826.2 ms) compared to the best result we got before.
You need to keep in mind that we had to increase the memory size to 512 MB to achieve this, however, if you run an API
with a lot of dependencies, you'll probably need to increase the memory size anyway.
So, if you're using a container image to deploy your Lambda functions,
minifying the code can help you reduce cold start times, but this is true also for traditional ZIP archive deployment.
You can learn more about this in
the [AWS blog post](https://aws.amazon.com/blogs/compute/optimizing-node-js-dependencies-in-aws-lambda/).

##### Does Base Image Matter?

Thanks to the excellent
paper [On-demand Container Loading in AWS Lambda](https://assets.amazon.science/25/06/d2e5ea9c411c9e4d366aa2fbbca5/on-demand-container-loading-in-aws-lambda.pdf)
and the [Marc Brooker post](https://brooker.co.za/blog/2023/05/23/snapshot-loading.html) summarizing it,
we know that the images are cached.

> The biggest win in container loading comes from deduplication: avoiding moving around the same piece of data multiple
> times. Almost all container images are created from a relatively small set of very popular base images, and by
> avoiding copying these base images around multiple times and caching them near where they are used, we can make things
> move much faster. Our data shows that something like 75% of container images contain less than 5% unique bytes.

The most straightforward conclusion is that the more popular your base image is, the faster it will be to load it
because it's more likely to be cached.
While we don't push you to use the most popular base image,
it's good to know that it can help you reduce cold start times.

##### Does Unused Dependencies Matter?

Unused dependencies can increase the size of your container image, but are they affecting cold start times?
Let's see.
We have two versions of the Large API, both having the same node_modules but different `index.js` file.
The first one requires all dependencies, the second one does not require any dependencies.

![Does Unused Dependencies Matter?](docs/images/does-unused-dependencies-matter.svg)

Surprisingly, the Lambda Function initialized almost 3 times faster when we didn't require any dependencies.
Again,
studying
the [On-demand Container Loading in AWS Lambda](https://assets.amazon.science/25/06/d2e5ea9c411c9e4d366aa2fbbca5/on-demand-container-loading-in-aws-lambda.pdf)
paper and the [Marc Brooker post](https://brooker.co.za/blog/2023/05/23/snapshot-loading.html),
we can find the following:

> Harter et al found that only 6.5% of container data is loaded on average. This was the second big win we were going
> for: the ~15x acceleration available from avoiding downloading whole images.

> We used FUSE to build a filesystem that knows about our chunked container format, and responds to reads by fetching
> just the chunks of the container it needs when they are needed. The chunks are kept in a tiered cache, with local
> in-memory copies of very recently-used chunks, local on-disk copies of less recent chunks, and per-availability zone
> caches with nearly all recent chunks. The whole set of chunks are stored in S3, meaning the cache doesn't need to
> provide durability, just low latency.

These findings collectively indicate that the platform adopts an on-demand approach to container image loading during
function initialization. As a result, it only loads the required chunks of the container, ensuring that unnecessary
dependencies are not loaded. Additionally, it's worth noting that the loading process involves fixed-size chunks, each
measuring 512KiB, rather than entire image layers.

### Key Takeaways

- **Container images offer a practical choice for deploying serverless workloads**, providing enhanced control over the
  environment and dependencies, and supporting multi-platform deployment with the same image.
- **Container images do not exhibit slower initialization compared to the traditional ZIP archive deployment**. In some
  scenarios, they may even outperform it.
- **The size of the container image plays a role**, influencing initialization duration. However, the impact remains
  relatively insignificant.
- **Memory size does not have a significant impact on cold start times**, though this may vary if intensive CPU or
  memory
  tasks are part of the initialization process.
- **Container images are cached.** Opting for popular base images can result in faster loading times due to cache
  availability.
- **Unused dependencies can inflate the image size, but they do not affect cold start times**, thanks to the on-demand
  loading approach.
- **Minifying your code can lead to reduced cold start times**, but this may necessitate an increase in memory size for
  running the container with minified code.
- **The choice of how you run your application can influence cold start times**. Using the runtime interface client
  installed in the node_modules directory is recommended for time-saving benefits.

## Google Cloud Run

### Understanding Google Cloud Run

The examination of Google Cloud Run's performance is pivotal for understanding its place in the serverless landscape,
especially when compared to services like AWS Lambda and Fargate.

Google Cloud Run is a fully managed compute platform that automatically scales your stateless containers. It is designed
for applications that respond to HTTP requests, making it a suitable choice for building microservices, APIs, and
event-driven workloads. Cloud Run is notable for its flexible pricing and execution models, where you can choose between
two CPU allocation options:

- CPU Always Allocated: In this model, the CPU is allocated to your container instance regardless of request activity,
  which can lead to higher costs but offers instant responsiveness for incoming requests.
- CPU Allocated During Request: This option allocates CPU to your container only during the processing of a request.
  This can be more cost-effective, especially for workloads with sporadic traffic, but may contribute to longer cold
  start times.

The pricing is structured around the resources consumed,
factoring in CPU, memory, and networking usage, charged to the nearest 100 milliseconds of execution time.
The number of requests processed also affects the cost (only with CPU only allocated during request), aligning expenses
closely with actual usage.

Now, let's delve into the performance of Cloud Run and how it stacks up against other serverless options like AWS
Lambda.

### Benchmark Results

The benchmark utilized the same Node.js applications which were used for AWS.
Deployments used three types of container images:

- **Buildpacks-generated**: Automated creation with larger image sizes. Google
  Cloud's [buildpacks](https://cloud.google.com/docs/buildpacks/overview) is an open-source
  project that takes your application source code and transforms it into production-ready container images.
- **Distroless Node.js**: Manually optimized with custom Dockerfile, smaller image sizes.
- **Node.js Slim**: Manually optimized with custom Dockerfile, similar to Distroless in size.

![Google Cloud Image Size](docs/images/google-cloud-image-size.svg)

As in the case of AWS, we ran each application 50 times and obtained the average startup time using
the `container/startup_latencies` [metric](https://cloud.google.com/monitoring/api/metrics_gcp).
We used the default service configuration that is 1 vCPU and 512 MB RAM.

![Google Cloud Cold Start](docs/images/google-cloud-cold-start.svg)

The data reveals that Buildpacks, while being a convenient option for automatic container creation, result in the
largest image sizes and longest cold start times. In contrast, both Distroless and Node Slim images are significantly
smaller and initiate much faster.

#### Cloud Run vs. AWS Lambda

Cloud Run's multi-request handling capability is a distinct advantage. Despite having longer cold
start times in some cases compared to AWS services, the lower frequency of cold starts due to concurrency may offset
this drawback.

#### Performance Optimization

When performance is crucial, opt for a custom Dockerfile using Distroless or Node Slim images.
These choices lead to more efficient cold starts, as evidenced by the lower times of 606 ms for Hello World and 7721 ms
for Large API using Distroless NodeJS, compared to 2360 ms and 9143 ms, respectively, for Buildpacks. Buildpacks may be
suitable for rapid development cycles but can compromise on startup performance. Weigh the need for
convenience against the need for speed.

#### Traffic Patterns

Consider the traffic pattern of your application. For apps with variable loads, Cloud Run's
concurrency benefits can provide significant performance gains over the single-request model of AWS Lambda.

## Optimizing for Scale: The Cost-Efficient Serverless Transition

Imagine your startup journey began with a simple yet compelling idea. You leveraged AWS Lambda's serverless platform for
its cost-effectiveness and rapid scaling, propelling your app into the hands of thousands. Success is yours, but with it
comes the inevitable: increased load, more HTTP requests per minute, and rising costs. Your Lambda architecture, once
the bedrock of your business, now demands a hefty portion of your revenue.

This is where our solution steps in—the bridge to a new horizon of serverless computing, and not just for scaling up,
but also for adjusting down if the tides of traffic ebb.

### From Lambda to Savings and Back: A Dynamic Shift

Our benchmarks, based on configurations closely aligned to 1 vCPU across platforms, reveal a narrative that resonates
with many in your position. For AWS Lambda, we calculated costs at 0.832 GB RAM, which equates to 2 vCPU with a 0.5 CPU
ceiling, resulting in 1
vCPU ([source](https://web.archive.org/web/20220629183438/https://www.sentiatechblog.com/aws-re-invent-2020-day-3-optimizing-lambda-cost-with-multi-threading)).
For AWS Fargate, we used a setup with 1 vCPU and 2 GB RAM for a
single task, since it's not feasible to have less than 2 GB with 1
vCPU ([source](https://docs.aws.amazon.com/AmazonECS/latest/userguide/fargate-task-defs.html#fargate-tasks-size)).
Google Cloud Run configurations were
pegged at 1 vCPU and 1 GB RAM. This standardized approach allows for a direct and fair comparison of cost efficiency
across platforms.
Where necessary, we added costs for serving HTTP requests using Application Load Balancer, API Gateway or CloudFront.

At 100 requests per minute, Lambda is cost-effective. But as demand swells to 500, then 1,000 requests per minute, the
tables turn. Conversely, should your traffic decrease, the flexible nature of Lambda could once again become your
economic ally.

![100 requests per minute](docs/images/100-req-min.svg)

Our charts clearly illustrate these shifts, showing Fargate and Cloud Run as financially superior choices at high
volume, and Lambda as a sensible reversion when demand subsides. The more your needs fluctuate, the more apparent it
becomes: a versatile approach to serverless computing saves you money.

![500 requests per minute](docs/images/500-req-min.svg)

But how do you make the switch without disrupting your service, without the technical overhead that comes with
migration?

### Your Growth, Uninterrupted (and Reversible)

Our platform-switching solution is engineered for this precise scenario. It's a gateway to effortlessly pivot between
serverless platforms, be it scaling to more cost-effective options like Fargate or Cloud Run during peak times or
reverting to Lambda when demands decrease. With our system, the transition is smooth, without the downtime that hurts
your service and reputation.

![1000 requests per minute](docs/images/1000-req-min.svg)

Here's what you gain:

- **Strategic Cost Optimization**: Our detailed benchmarks, available in our comprehensive spreadsheet, guide you to
  make informed decisions, ensuring you only pay for what you need, when you need it, even if that means scaling back.
- **Zero Downtime Migration**: Our tools are designed for uninterrupted service. Switch serverless platforms without
  your users noticing a thing, in either direction.
- **Data-Driven Insights**: We equip you with comprehensive comparisons, helping you understand the cost implications at
  every scale and traffic pattern.
- **Scalability and Reversibility**: Your startup's saga is one of evolution, and so is your infrastructure. Our
  solution ensures that your technology is as adaptable and responsive as your growing enterprise.

### Your Future, Cost-Optimized

Your path from startup to success doesn't have to be weighed down by increasing serverless costs, nor does it have to
remain fixed during quieter periods. With our switching solution, you can continue to harness the power of serverless
architecture, efficiently and affordably, in a way that reflects your current traffic and budgetary realities.
Transition on your terms, scale on your schedule, and adapt as needed—because serverless flexibility is the cornerstone
of your thriving business.

Welcome to the next stage of your growth journey—let's make it a cost-effective one.
