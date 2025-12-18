# Runners

Runners are the building blocks of the CLI. They are responsible for executing commands and managing their input and output.

Runners are implemented as classes that extend the `Runner` abstract class. These classes are instantiated by the SF-Core Framework and executed via the `run` method.

The `Runner` class defines two types of functions:

1. **Functions called by the SF-Core Framework**:
   These include methods like `configFileNames` and `run`.

2. **Functions available for use in the Runner implementation**:
   These include methods like `authenticate` and `resolveVariables`.

### Functions that are called by the SF-Core Framework

#### Functions **REQUIRED** to be implemented

- **`configFileNames`**: Returns the names of the configuration files that invoke the runner.
- **`shouldRun`**: Returns a boolean indicating whether the runner should be invoked based on the configuration file.
- **`getCliSchema`**: Returns the CLI schema for the runner. The schema is used to generate help messages and validate command line arguments. See [CLI schema](#cli-schema) for more information.
- **`run`**: Executes the runner.
- **`getServiceUniqueId`**: Returns the unique identifier of the service that the runner is deploying. Used for usage tracking and as a key in state storage.

#### Functions that are **OPTIONAL** to be implemented

- **`customConfigFilePath`**: Returns the path to the custom configuration file, such as the `config` CLI option.
- **`getUsageEventDetails`**: Additional details for the usage event.
  **IMPORTANT**: This data is sent to the Serverless, Inc. API. Do not include any unnecessary or sensitive data.
- **`getAnalysisEventDetails`**: Additional details for the analysis event.
- **`getDeploymentEventDetails`**: Deployment event details.

### Functions that can be called in the Runner implementation

#### Authentication

- **`authenticate`**: Authenticates the user using the following inputs:

  - **`org`**: Sourced from the `org` CLI option, `org` key in the config file, or the `SERVERLESS_ORG_NAME` environment variable.
  - **`app`**: Sourced from the `app` CLI option or the `app` key in the config file.
  - **`service`**: Sourced from the `service` key in the config file.
  - **`stage`**: Sourced from the `stage` CLI option, `provider.stage` key in the config file, or defaults to `dev`.
  - **`region`**: Sourced from the `region` CLI option, `provider.region` key in the config file, or defaults to `us-east-1`.
  - **`license key`**: Sourced from:
    - The `SERVERLESS_LICENSE_KEY` or `SERVERLESS_ORG_ACCESS_KEY` environment variable.
    - The `licenseKey` key in the config file.
    - The `/serverless-framework/license-key` SSM parameter in the AWS account used by the deployment.

- **`resolveVariablesAndAuthenticate`**: Resolves variables in the config file before authentication, in the following order:
  - **`org`**, **`app`**, **`service`**, **`stage`**, **`region`**: Required for Dashboard authentication to retrieve service-specific information, such as parameters and AWS credentials from the Dashboard Provider.
  - **`provider.profile`**: Required for AWS SDK authentication. Since `licenseKey` supports AWS resolvers like `ssm`, the AWS profile must be determined.
  - **`licenseKey`**: Resolved for further usage.

#### Configuration file and Variable Resolution

- **`resolveVariables`**: Resolves variables in the configuration file.

- **`reloadConfig`**: Reloads the configuration file without resolving variables. Updates the following properties:
  - **`this.config`**: Sets a new configuration object.
  - **`this.configFilePath`**: Updates to the new configuration file path.
  - **`this.resolverManager`**: Recreates the resolver manager with the new configuration object.
  - **`this.stage`**: Updates to the new stage if the source of the stage is the configuration file.

#### State Management

- **`resolveStateStore`**: Creates a new state store or reuses an existing one. This function must be called before using the state store.

#### Credentials

- **`getProviderCredentials`**: Returns the Resolver Provider credentials. The provider must be set in the config file under `stages.<stage>.resolvers`. This function uses the `resolveCredentials` method defined in the Resolver Provider.
- **`fetchData`**: Fetches data using the Resolver defined in the Provider (`stages.<stage>.resolvers.<provider>.<resolver>`). This function relies on the `resolveVariable` method defined in the Resolver Provider.
- **`storeData`**: Stores data using the Resolver defined in the Provider (`stages.<stage>.resolvers.<provider>.<resolver>`). This function uses the `storeData` method defined in the Resolver Provider.

### CLI Schema

The CLI schema is a JSON object that describes the command-line interface (CLI) for a command. It is used to:

- Generate help messages.
- Validate arguments and options.

Under the hood, the schema is transformed into a [yargs](https://yargs.js.org/) configuration object.
See the [Yargs API reference](https://yargs.js.org/docs/#api-reference) for more details about schema properties.
