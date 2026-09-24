# Python services

Read this when a service has Python functions: packaging their dependencies,
building them for Lambda from macOS or Windows, and iterating locally.

## Dependencies

The Framework packages `requirements.txt` (or a Pipfile, Poetry, or uv
project) only when `serverless.yml` has a `custom.pythonRequirements` block;
an empty one is enough:

```yaml
provider:
  name: aws
  runtime: python3.14
custom:
  pythonRequirements: {}
```

Add the block whenever a Python service has requirements, unless they reach
Lambda another way (a layer, a prebuilt artifact, a container image);
without it the dependencies are left out of the package and the function
fails on import in Lambda. To check, list the zip after
`serverless package`: `unzip -Z1 .serverless/<service>.zip` should show the
dependency folders next to the handler.

## Building for Lambda on macOS or Windows

Packages with native code must be built for Lambda's Linux, not for the
machine running `package`: a macOS build of them imports only on macOS. Default to Linux wheels, and switch to Docker for a service with a
dependency that has none:

- **Linux wheels, no Docker:** when every dependency publishes Linux wheels,
  pip can fetch them directly. Name the platforms (both manylinux tags, so
  pip takes either kind of wheel) and the runtime's Python version, and quote
  the items (an unquoted `--only-binary=:all:` parses as a YAML map):

  ```yaml
  custom:
    pythonRequirements:
      pipCmdExtraArgs:
        - '--platform=manylinux2014_x86_64' # manylinux2014_aarch64 for arm64
        - '--platform=manylinux_2_28_x86_64' # manylinux_2_28_aarch64 for arm64
        - '--python-version=3.14' # the runtime's version
        - '--only-binary=:all:'
  ```

  A package without a Linux wheel then fails the install; switch to Docker for
  that service.

- **Docker:** `dockerizePip: true` installs inside an AWS build image. It works
  for every package and needs a running Docker daemon.

To confirm a build, list the native files in the zip after
`serverless package`: `unzip -Z1 .serverless/<service>.zip | grep '\.so$'`
should show `linux` in the names, not `darwin`.

## The interpreter

Requirements install with the interpreter named after the runtime
(`python3.14` for `runtime: python3.14`), with no fallback to `python3`, even
when `python3` is that same version. When only `python3` is installed, the
install stops naming the missing interpreter: set
`custom.pythonRequirements.pythonBin: python3`. Its version should match the
runtime; with the Linux-wheel settings above, `--python-version` covers a
mismatch.

## Iterating locally

`serverless dev` runs Node.js functions only
([development-workflow.md](development-workflow.md)), so for Python:

1. Unit tests with `pytest`, the AWS SDK stubbed (`botocore.stub.Stubber` or
   `moto`), in a virtual environment that has the service's requirements.
   Keep the environment and the tests out of the package: files in the
   service directory are zipped into every function unless excluded, and a
   `.venv` carries the local machine's builds.

   ```yaml
   package:
     patterns:
       - '!.venv/**'
       - '!tests/**'
       - '!.pytest_cache/**'
       - '!**/__pycache__/**'
   ```

2. `serverless invoke local -f <function> --path events/<event>.json` runs the
   handler on your machine with a Lambda-style event. It runs `python3` from
   your `PATH` (an active virtual environment comes first), so activate the
   one with the requirements.
3. Deploy your stage and run the integration tests against it
   ([development-workflow.md](development-workflow.md)). To check the
   deployed code directly, use `serverless invoke -f <function>` and
   `serverless logs -f <function>`.

Full option reference: `serverless agent docs providers/aws/guide/python`.
