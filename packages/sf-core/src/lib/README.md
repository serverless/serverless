# Serverless Framework Core

## Architecture and Workflow

### Runners (CLI Logic)

Location: `/src/lib/runners/`

Runners handle all CLI interactions. They parse commands, manage user input (including help and status messages), show prompts (e.g. confirmations) and call the appropriate actions. The central router (`/src/lib/router.js`) dispatches commands to the correct Runner, which may then interact with the Engine or Frameworks for deployments, removals, or information retrieval.

It is important to put all CLI logic and handling in the runners. Do not put CLI logic in the Engine or Frameworks. Those are designed to be client agnostic.

### Frameworks (Business Logic)

Location: `/src/lib/frameworks/`

Frameworks contain the business logic for various deployment experiences. They work independently of the CLI, providing programmatic APIs that can be used by both CLI commands and other system components. Frameworks integrate with the Engine to perform complex tasks while hiding their internal complexities behind simple interfaces.

Frameworks are designed to be client agnostic. They should not know anything about the CLI or the Engine. They should only know about the deployment experience they are trying to achieve.

Frameworks can save and load state. The Engine does as well but only manipulates the `state.deployment` property. Frameworks must not save/overwrite that property if they choose to save state.

### Engine (Deployment and State Management)

Location: `/src/lib/engine/`

The Engine is responsible for deploying infrastructure, removing services, and managing development mode (devMode). It reads configuration files, interacts with resources in cloud providers, and manages state to deploy and remove services.

The Engine expects a `deployment` property in the root of the Framework configuration. If your Framework does not need deployment capabilities, don't include the `deployment` property and don't instantiate the Engine.

Otherwise, all deployment capabilities must be centralized in the Engine, to optimize for reusability, consistency, testing, etc.

The Engine is capable of different architectural patterns by relying on Deployment Types, declared in the `deployment.type` property of the Framework configuration. It relies on Deployment Types to provide the implementation for each of the Engine's capabilities (e.g. deployment, removal, etc.).

Many schemas are defined in the Engine for State and Configuration. Those should be used whenever possible. Frameworks can incorporate Engine's scehmas for many common properties, keeping their configuration DRY and easier to maintain.

### Deployment Types (Architectural Patterns)

Location: `/src/lib/engine/deploymentTypes/`

Deployment Types implement specific architectural patterns aimed at different cloud providers or deployment scenarios (e.g., an `awsApi` deployment type for an AWS API architecture). The Engine selects the appropriate Deployment Type based on what Framework configuration files have set in `deployment.type`, allowing new cloud architectures and providers to be integrated easily.

Deployment Types should rely on external utilities to improve reusability and consistency. For example, using the `aws` folder utilities to interact with AWS services, or the `docker` folder utilities to interact with Docker services. When writing a Deployment Type, put anything you feel could be reused in other Deployment Types in other areas.

### devMode (Local Development Experience)

Location: `/src/lib/engine/devMode/`

devMode provides a consistent local development experience for Deployment Types. It was designed separately from Deployment Types because many components are reusable (e.g. running containers locally, file watching, setting up a local proxy for API calls, etc.).

While DevMode is agnostic to Deployment Types, it is designed to support patterns that Deployment Types require.

### AWS Utilities

Location: `/src/lib/aws/`

AWS Abstractions provide modules that interact with AWS services, such as ACM, ALB, CloudFormation, ECS, IAM, Lambda, Route53, S3, SSM, and VPC. Both the Engine and Deployment Types use these abstractions to interact securely with AWS while abstracting the complexity of underlying SDK calls.

### Router (Command Dispatching)

Location: `/src/lib/router.js`

The Router serves as the central command dispatcher. It maps CLI commands to the appropriate Runner or Engine actions, validates command schemas, and handles state finalization and event publishing. This component ensures smooth command processing and robust handling of user input.

---

## Extending the Codebase

To add new features or support additional cloud providers, follow these guidelines:

- **New Runner or CLI Command:**
  Add or modify files in `/src/lib/runners/` following the established patterns for command parsing and interaction with the Router.

- **New Framework:**
  Develop a new framework in `/src/lib/frameworks/` to encapsulate your business logic. Ensure the framework integrates smoothly with the Engine to support deployment operations.

- **New Deployment Type:**
  Implement a new deployment pattern in `/src/lib/engine/deploymentTypes/`, similar to the `awsApi` example. This will allow support for additional cloud architectures and providers.

- **Custom devMode:**
  If a tailored local development experience is needed, extend the generic devMode in `/src/lib/engine/devMode/` while reusing as much shared code as possible.

By following these guidelines and leveraging the existing patterns, new experiences and deployment strategies can be rapidly introduced without impacting existing functionality.
