<!--
title: Python Requirements Packaging
description: Package Python dependencies from requirements.txt, Pipenv, Poetry or uv into Lambda functions and layers, with Docker builds, caching and slimming.
short_title: Python Support
keywords:
  [
    'Serverless Framework',
    'Python requirements',
    'serverless-python-requirements',
    'Lambda Python dependencies',
    'Pipenv',
    'Poetry',
    'uv',
    'pip',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/python)

<!-- DOCS-SITE-LINK:END -->

# Python Requirements Packaging

The Serverless Framework installs your Python functions' dependencies from `requirements.txt`, a Pipenv `Pipfile`, a Poetry `pyproject.toml` or a `uv.lock`, and adds them to each function's deployment package, so `import` works in Lambda without a plugin. It is built in and turns on when `serverless.yml` has a `custom.pythonRequirements` block. Use it for functions on a `python3.*` runtime; for a container image function, install dependencies in the image instead.

To deploy a function that imports `requests`, put the dependency in `requirements.txt` next to `serverless.yml`:

```text
requests
```

Then enable the built-in packaging with an empty `custom.pythonRequirements` block:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: python3.14

custom:
  pythonRequirements: {}

functions:
  hello:
    handler: handler.hello
```

On `serverless deploy` (also `serverless package` and `serverless deploy function`), the Framework runs `python3.14 -m pip install` into a local cache and adds the installed packages to the root of the function's zip. Without `dockerizePip`, the interpreter named after the runtime must be on your `PATH`, or set [`pythonBin`](#set-the-python-interpreter); packages with compiled code need [Docker or Linux wheels](#build-linux-dependencies-on-macos-and-windows) when you deploy from macOS or Windows.

## Migrate from the serverless-python-requirements plugin

The built-in packaging replaces the community [`serverless-python-requirements`](https://github.com/serverless/serverless-python-requirements) plugin, with the same options under `custom.pythonRequirements`. To migrate, remove the plugin from `plugins` in `serverless.yml` and from `package.json`, and keep the `custom.pythonRequirements` block, even as `{}`: without the block, the Framework doesn't install requirements. Thanks to the plugin's original maintainers at [Capital One](https://www.capitalone.com/tech/open-source/) and its contributors.

## Choose a dependency source

The Framework reads dependencies from one of these sources, highest precedence first, and installs them with pip:

1. A Poetry project: a `pyproject.toml` whose `[build-system]` `requires` names Poetry (for example `poetry-core`).
2. A `uv.lock` in the service directory.
3. A `Pipfile` in the service directory.
4. The requirements file, `requirements.txt` by default.

Before installing, the Framework converts each `Pipfile` and `uv.lock` in the service directory, whichever source is used: with both files present, the `uv.lock` export replaces the `Pipfile` one, and `pipenv` or `uv` must be installed for each file that exists. To skip a source, set `usePipenv: false`, `useUv: false` or `usePoetry: false`.

To read a requirements file with another name, set `fileName`:

```yaml
custom:
  pythonRequirements:
    fileName: requirements-prod.txt
```

To skip one of the tools and fall through to the next source, set `usePoetry: false`, `usePipenv: false` or `useUv: false`. The generated `requirements.txt` is written to `.serverless/requirements.txt`.

### Poetry projects

For a Poetry project, the Framework runs `poetry export --without-hashes -f requirements.txt -o requirements.txt --with-credentials` in the project directory. `poetry` must be installed with its export plugin: Poetry 2.0 and later don't include `poetry export`, so add it with `poetry self add poetry-plugin-export` (see the [Poetry export command](https://python-poetry.org/docs/cli/)). Without `poetry`, packaging stops with:

```text
poetry not found! Install it according to the poetry docs.
```

Without a `poetry.lock`, Poetry creates one during the export. For reproducible builds, set `requirePoetryLockFile: true` to stop packaging with `poetry.lock file not found - set requirePoetryLockFile to false to disable this error` instead.

Poetry dependency groups other than the main one aren't installed by default. `poetryWithGroups`, `poetryWithoutGroups` and `poetryOnlyGroups` pass `--with`, `--without` and `--only` to `poetry export`:

```yaml
custom:
  pythonRequirements:
    poetryWithGroups:
      - internal_dependencies
      - lambda_dependencies
```

The Framework removes `-e` (editable) flags from the exported file, because pip can't install editable requirements into a target directory. For a git dependency to install without `-e`, give its URL with a scheme:

```toml
[tool.poetry.dependencies]
bottle = { git = "https://git@github.com/bottlepy/bottle.git", tag = "0.12.16" }
```

With an SSH key configured, use `ssh://git@github.com/bottlepy/bottle.git` as the URL instead. A URL without a scheme, such as `git@github.com/bottlepy/bottle.git`, doesn't install.

### Pipenv projects

For a `Pipfile`, the Framework runs `pipenv requirements` (pipenv 2022.4.8 or later). Without a `Pipfile.lock`, it runs `pipenv lock` first and logs a warning. `pipenv` must be installed; without it, packaging stops with `pipenv not found! Install it according to the pipenv docs.`

### uv projects

For a [`uv`](https://docs.astral.sh/uv/) project with a `uv.lock`, the Framework runs `uv export --no-dev --frozen --no-hashes --no-emit-project`. `uv` must be installed; without it, packaging stops with `uv not found! Install it according to the uv docs.`

The export includes the project's base dependencies and never the `dev` group. These options add extras and groups:

| Option                   | uv flag        | Effect                                                         |
| ------------------------ | -------------- | -------------------------------------------------------------- |
| `uvOptionalDependencies` | `--extra`      | Include optional dependency extras                             |
| `uvWithGroups`           | `--group`      | Include additional dependency groups                           |
| `uvWithoutGroups`        | `--no-group`   | Exclude specific dependency groups                             |
| `uvOnlyGroups`           | `--only-group` | Include only the specified groups (excludes base dependencies) |

```yaml
custom:
  pythonRequirements:
    uvOptionalDependencies:
      - aws # [project.optional-dependencies].aws
    uvWithGroups:
      - lambda-extras # [dependency-groups].lambda-extras
```

The `dev` group stays out even with `uvWithGroups: [dev]`, because uv gives `--no-dev` precedence over `--group`. Put dependencies a function needs at runtime in another group.

### Install with uv instead of pip

To run the install step with `uv pip install` instead of `python -m pip install`, set `installer: uv`. It works with any dependency source:

```yaml
custom:
  pythonRequirements:
    installer: uv
```

`uv` must be available where the install runs. With `dockerizePip` and the default AWS build images, the Framework installs `uv` in the container first; a custom `dockerImage` or `dockerFile` must include `uv`. For local packages in the requirements (such as `-e .`), the Framework passes `--reinstall-package` so changes are picked up.

## Build Linux dependencies on macOS and Windows

Lambda runs on Amazon Linux, so packages with compiled code must be built or downloaded for Linux. To install the requirements in a Docker container that matches the runtime, set `dockerizePip`:

```yaml
custom:
  pythonRequirements:
    dockerizePip: true
```

`dockerizePip: non-linux` uses Docker only when you deploy from macOS or Windows. Each function uses the [AWS SAM build image](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-image-repositories.html) `public.ecr.aws/sam/build-<runtime>:latest-<architecture>`, from the function's or the provider's `runtime` and `architecture` (default `x86_64`). `dockerizePip` applies to every function in the service. Docker must be installed and running; the install runs in the container, so the runtime's Python version isn't needed on your machine.

To use another image, set `dockerImage` to the full image name and tag, or `dockerFile` to a Dockerfile in the service directory; setting both stops packaging with `Python Requirements: you can provide a dockerImage or a dockerFile option, not both.`

```yaml
custom:
  pythonRequirements:
    dockerizePip: true
    dockerFile: ./Dockerfile
```

The Framework builds the Dockerfile as the image `sls-py-reqs-custom`, with the current directory as the build context. The Docker options apply only with `dockerizePip`; without it, the Framework logs `You provided a docker related option but dockerizePip is set to false.`

These options change how the container runs:

- `dockerSsh: true`: mounts `~/.ssh/id_rsa` (or the file in `dockerPrivateKey`, an absolute path), `~/.ssh/known_hosts` and the `SSH_AUTH_SOCK` agent socket, to install from private git repositories. The repository host must be in `known_hosts`; a password-protected key works through `ssh-agent`.
- `dockerEnv`: a list of environment variables passed with `docker run -e`, for example `https_proxy` or `NAME=value`.
- `dockerBuildCmdExtraArgs`: a list of extra arguments for `docker build` with `dockerFile`.
- `dockerRunCmdExtraArgs`: a list of extra arguments for `docker run`.
- `dockerRootless: true`: for rootless Docker on Linux. By default the Framework changes the owner of the installed files to your user after the install; with this option they stay owned by the container's root user, which rootless Docker maps to you.

```yaml
custom:
  pythonRequirements:
    dockerizePip: true
    dockerSsh: true
    dockerPrivateKey: /home/me/.ssh/id_ed25519
    dockerEnv:
      - https_proxy
    dockerBuildCmdExtraArgs: ['--build-arg', 'MY_ARG=123']
    dockerRunCmdExtraArgs: ['-v', '${env:PWD}:/my-app']
```

### Linux wheels without Docker

When every dependency publishes Linux wheels, pip can download them on macOS or Windows without Docker. Name the Lambda platforms (both manylinux tags, so pip takes either kind of wheel) and the runtime's Python version:

```yaml
provider:
  runtime: python3.14
  architecture: x86_64
custom:
  pythonRequirements:
    pipCmdExtraArgs:
      - '--platform=manylinux2014_x86_64' # manylinux2014_aarch64 for arm64
      - '--platform=manylinux_2_28_x86_64' # manylinux_2_28_aarch64 for arm64
      - '--python-version=3.14' # the runtime's version
      - '--only-binary=:all:'
```

`--python-version` matters when the local interpreter is a different version than the runtime: without it, pip picks wheels for the local version, which Lambda can't load. With `--only-binary=:all:`, a package that ships only a source distribution stops the install instead of being built for the local machine; use `dockerizePip` for those. Quote the items, since `--only-binary=:all:` unquoted parses as a YAML map.

## Reduce the package size

Lambda limits the unzipped size of a function and its layers. These options shrink what the Framework adds.

### Remove files with slim

`slim: true` deletes `.pyc` and `.pyo` files and the `__pycache__` and `.dist-info` directories from the installed packages, and strips the `.so` files:

```yaml
custom:
  pythonRequirements:
    slim: true
```

The `.so` files are stripped inside Docker with `dockerizePip`, and directly on Linux and WSL; on macOS, and on Windows outside WSL, `slim` without `dockerizePip` deletes files but doesn't strip. If stripping breaks a library (for example "ELF load command address/offset not properly aligned"), keep the deletion and turn stripping off with `strip: false`.

To delete more files, add glob patterns in `slimPatterns`. Patterns match whole paths, so start them with `**/` to match in any directory. They are added to the default patterns (`**/*.py[c|o]`, `**/__pycache__*`, `**/*.dist-info*`); `slimPatternsAppendDefaults: false` uses only yours:

```yaml
custom:
  pythonRequirements:
    slim: true
    slimPatterns:
      - '**/*.egg-info*'
```

### Compress the requirements with zip

`zip: true` packages the requirements as `.requirements.zip` plus an `unzip_requirements.py` helper, which extracts them to `/tmp/sls-py-req` on first import:

```yaml
custom:
  pythonRequirements:
    zip: true
```

Import the helper in your handler module before any code that imports your dependencies:

```python
try:
    import unzip_requirements
except ImportError:
    pass
```

The Framework copies `unzip_requirements.py` into the service directory while packaging and removes it afterwards; `cleanupZipHelper: false` keeps it.

### Put the requirements in a Lambda layer

`layer: true` packages the requirements as a [Lambda layer](https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html) instead of adding them to each function:

```yaml
custom:
  pythonRequirements:
    layer: true

functions:
  hello:
    handler: handler.hello
    layers:
      - Ref: PythonRequirementsLambdaLayer
```

The layer is named `<service>-<stage>-python-requirements`, with the provider's `runtime` as its compatible runtime. Reference it from each function with `Ref: PythonRequirementsLambdaLayer`. To change its settings, give `layer` an object with the keys of a [`layers`](./layers.md) entry:

```yaml
custom:
  pythonRequirements:
    layer:
      name: ${sls:stage}-python-requirements
      description: Python requirements
      compatibleRuntimes:
        - python3.14
      licenseInfo: GPLv3
      allowedAccounts:
        - '123456789012'
```

### Leave packages out with noDeploy

`noDeploy` lists packages that the Framework removes from the requirements and from the package, for example test tools. Dependencies of a listed package stay unless you list them too:

```yaml
custom:
  pythonRequirements:
    noDeploy:
      - pytest
```

### Keep local environments out of the package

The requirements are installed into the package itself, so a virtual environment in the service directory (`.venv/`, `venv/`) isn't needed in Lambda. It is packaged like any other file unless you exclude it, adding the local machine's builds to every function. Python's local caches are packaged the same way:

```yaml
package:
  patterns:
    - '!.venv/**'
    - '!.pytest_cache/**'
    - '!**/__pycache__/**'
```

## Install requirements per function

To give each function only its own dependencies, put each function's code and `requirements.txt` (or Poetry `pyproject.toml`) in its own directory, set `package.individually: true`, and name the directory in the function's `module`:

```text
├── serverless.yml
├── function1
│   ├── requirements.txt
│   └── index.py
└── function2
    ├── requirements.txt
    └── index.py
```

```yaml
package:
  individually: true

functions:
  func1:
    handler: index.handler
    module: function1
  func2:
    handler: index.handler
    module: function2
```

Each zip contains the module directory's contents at its root plus that module's requirements, so `handler` has no directory prefix: for `function1/index.py`, write `handler: index.handler` with `module: function1`, not `handler: function1/index.handler`. `package.individually: true` can also be set on single functions.

How modules affect the other settings:

- `package.patterns` match paths from the service directory, before the module's contents move to the zip's root; `'!**/tests/**'` excludes `tests` directories in every module.
- Each module's requirements are generated in `.serverless/<module>/requirements.txt` and installed separately. The static cache is keyed by the generated requirements, the install settings and the architecture, not the module, so modules with the same requirements share a cache entry.
- Inside a module, a Poetry `pyproject.toml` is used before `requirements.txt`, and a `pyproject.toml` at the service root applies only to functions without `module`. A `Pipfile` or `uv.lock` at the service root applies to every function, modules included, and replaces each module's `requirements.txt`; to use per-module requirements files, set `usePipenv: false` or `useUv: false`. `installer: uv` works with module `requirements.txt` files.

## Add a vendor directory

To add libraries that pip doesn't install, such as a tailored build of a large package, put them in a directory and set `vendor`. The Framework copies the directory's contents next to the installed requirements. With `package.individually: true` and `useStaticCache: false`, `vendor` on a function adds a vendor directory for that function's module. Requirements are built once per module, so functions that share a module (all functions without `module` share one) get the first function's `vendor`, and the others' are ignored. With the static cache on, the function's vendor files are stored in the shared cache entry for those requirements, so they can reach other modules with the same requirements, or be left out after a change; set `useStaticCache: false` when you use function-level `vendor`. The configuration validation logs a warning for the key, which the function schema doesn't list:

```yaml
custom:
  pythonRequirements:
    vendor: ./vendored-libraries
    useStaticCache: false

package:
  individually: true

functions:
  hello:
    handler: hello.handler
    vendor: ./hello-vendor
```

## Caching

Two caches are on by default and shared by all your services:

- `useStaticCache`: keeps each install, keyed by the generated `requirements.txt`, the provider's `architecture` and the settings that change the result (`pythonBin`, the runtime, `installer`, `dockerizePip`, `dockerImage`, `dockerFile`, `pipCmdExtraArgs`, `slim`, `strip`, `slimPatterns`, `slimPatternsAppendDefaults` and `vendor`). A deploy with the same key reuses the install.
- `useDownloadCache`: keeps pip's downloads, mounted into the container with `dockerizePip`.

The caches live in `~/Library/Caches/serverless-python-requirements` on macOS, `%LOCALAPPDATA%\ServerlessFramework\serverless-python-requirements\Cache` on Windows, and `$XDG_CACHE_HOME/serverless-python-requirements` (or `~/.cache/serverless-python-requirements`) on Linux. `cacheLocation` moves them; keep it outside the service directory, or packaging reads every cached file before discarding it. `staticCacheMaxVersions` caps the number of static cache entries and removes the least recently used first; the default `0` keeps all:

```yaml
custom:
  pythonRequirements:
    useStaticCache: true
    useDownloadCache: true
    cacheLocation: /home/me/.cache/my-python-cache
    staticCacheMaxVersions: 10
```

A change inside a local package that `requirements.txt` references (such as `-e ./mylib`) doesn't change the static cache key. After changing one, run `serverless requirements cleanCache`, or set `useStaticCache: false` to install on every package. `--cache-dir` in `pipCmdExtraArgs` stops packaging with an error when `dockerizePip` is on, and logs a deprecation warning otherwise; use `useDownloadCache`.

### Bytecode

Dependencies are installed with `SOURCE_DATE_EPOCH` set, which makes pip write hash-based `.pyc` files ([PEP 552](https://peps.python.org/pep-0552/)). Timestamp-based `.pyc` files go stale in packaging, because every zip entry gets a fixed date so unchanged code isn't redeployed; Python would recompile every dependency on every cold start. Hash-based files stay valid, and a source file that doesn't match its `.pyc` is still recompiled. A `SOURCE_DATE_EPOCH` you set in your shell or in `dockerEnv` is used instead of the default.

## Customize the pip command

`pipCmdExtraArgs` adds arguments to every install, as a list of strings. Each item is one argument, or an option and its value separated by a space; with `installer: uv`, they go to `uv pip install`. See [pip install options](https://pip.pypa.io/en/stable/cli/pip_install/):

```yaml
custom:
  pythonRequirements:
    pipCmdExtraArgs:
      - --compile
```

### Set the Python interpreter

By default, requirements are installed with the interpreter named after the provider's runtime: `python3.14` for `runtime: python3.14` (`python.exe` on Windows, and `python` when `provider.runtime` isn't set). There is no fallback to `python3`, even when that is the same version. When the runtime's name isn't on your `PATH` (common with pyenv, Windows and Homebrew installs that provide only `python3`), set `pythonBin` to the interpreter you have. It must be the runtime's Python version, or add `--python-version` as in [Linux wheels without Docker](#linux-wheels-without-docker):

```yaml
custom:
  pythonRequirements:
    pythonBin: /opt/python3.14/bin/python
```

## Requirements commands

The `serverless requirements` commands run parts of the packaging on their own:

```bash
serverless requirements install
```

`install` installs the requirements (and adds `unzip_requirements.py` with `zip`) without packaging.

```bash
serverless requirements clean
```

`clean` deletes the `.requirements` directory and, with `zip`, the `.requirements.zip` and `unzip_requirements.py` files from the service directory.

```bash
serverless requirements cleanCache
```

`cleanCache` deletes the static cache entries and the download cache from the cache location. Run it when a package has dependencies that don't match your requirements files, for example after changing Python versions or a local package referenced from `requirements.txt`.

## Native libraries

Some packages need operating system libraries to build or to run. To install build dependencies, use a Dockerfile based on the runtime's build image:

```dockerfile
FROM public.ecr.aws/sam/build-python3.14

RUN dnf -y install mariadb-connector-c-devel
```

```yaml
custom:
  pythonRequirements:
    dockerizePip: true
    dockerFile: Dockerfile
```

To ship a library that a package loads at runtime, list its path in the container in `dockerExtraFiles`; the Framework copies each file to the root of the package. For example, the `mysqlclient` package loads the MariaDB client library:

```yaml
custom:
  pythonRequirements:
    dockerizePip: true
    dockerFile: Dockerfile
    dockerExtraFiles:
      - /usr/lib64/libmariadb.so.3
```

To check that the file is in the package, run `serverless package` and list the zip with `zipinfo .serverless/my-service.zip`.

## Turn off the built-in packaging

To manage Python dependencies yourself or with another tool, remove the `custom.pythonRequirements` block, or set `enabled: false` to keep the other settings. The Framework then packages your code without installing requirements; with `enabled: false` it logs `Skipping built-in python requirements packaging because custom.pythonRequirements.enabled is set to false.`

```yaml
custom:
  pythonRequirements:
    enabled: false
```

## Configuration reference for custom.pythonRequirements

| Key                                                                         | Type                   | Default                                                    |
| --------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `enabled`                                                                   | boolean                | `true` when the block exists                               |
| `fileName`                                                                  | string                 | `requirements.txt`                                         |
| `usePoetry`, `usePipenv`, `useUv`                                           | boolean                | `true`                                                     |
| `requirePoetryLockFile`                                                     | boolean                | `false`                                                    |
| `poetryWithGroups`, `poetryWithoutGroups`, `poetryOnlyGroups`               | list of strings        | `[]`                                                       |
| `uvOptionalDependencies`, `uvWithGroups`, `uvWithoutGroups`, `uvOnlyGroups` | list of strings        | `[]`                                                       |
| `installer`                                                                 | `pip` or `uv`          | `pip`                                                      |
| `pythonBin`                                                                 | string                 | the provider's runtime name, `python.exe` on Windows       |
| `pipCmdExtraArgs`                                                           | list of strings        | `[]`                                                       |
| `dockerizePip`                                                              | boolean or `non-linux` | `false`                                                    |
| `dockerImage`                                                               | string                 | `public.ecr.aws/sam/build-<runtime>:latest-<architecture>` |
| `dockerFile`                                                                | string                 | none                                                       |
| `dockerBuildCmdExtraArgs`, `dockerRunCmdExtraArgs`                          | list of strings        | `[]`                                                       |
| `dockerSsh`                                                                 | boolean                | `false`                                                    |
| `dockerPrivateKey`                                                          | string                 | `~/.ssh/id_rsa`                                            |
| `dockerEnv`                                                                 | list of strings        | none                                                       |
| `dockerExtraFiles`                                                          | list of strings        | `[]`                                                       |
| `dockerRootless`                                                            | boolean                | `false`                                                    |
| `slim`                                                                      | boolean                | `false`                                                    |
| `strip`                                                                     | boolean                | `true` (applies with `slim`)                               |
| `slimPatterns`                                                              | list of strings        | none                                                       |
| `slimPatternsAppendDefaults`                                                | boolean                | `true`                                                     |
| `zip`                                                                       | boolean                | `false`                                                    |
| `cleanupZipHelper`                                                          | boolean                | `true`                                                     |
| `layer`                                                                     | boolean or object      | `false`                                                    |
| `noDeploy`                                                                  | list of strings        | `[]`                                                       |
| `vendor`                                                                    | string                 | none                                                       |
| `useStaticCache`, `useDownloadCache`                                        | boolean                | `true`                                                     |
| `cacheLocation`                                                             | string                 | the per-OS cache directory in [Caching](#caching)          |
| `staticCacheMaxVersions`                                                    | integer                | `0` (no limit)                                             |

Under `functions.<name>`, the Python requirements settings are `module` (the directory with the function's code and requirements) and `vendor`; the other function keys, such as `package`, work as for any function.

## Troubleshooting Python requirements

### `"python3.14" was not found. Python requirements are installed with ...`

```text
"python3.14" was not found. Python requirements are installed with the interpreter named after the runtime unless custom.pythonRequirements.pythonBin names another; install python3.14, or set pythonBin to the interpreter you have (for example "python3"), which must be the runtime's Python version.
```

This happens when no interpreter with the runtime's name is on your `PATH`. Install that Python version, or set [`pythonBin`](#set-the-python-interpreter) to an interpreter of the same version.

### `custom.pythonRequirements.pipCmdExtraArgs must be a list of strings ...`

```text
custom.pythonRequirements.pipCmdExtraArgs must be a list of strings. Quote items that contain a colon, for example - "--only-binary=:all:".
```

This happens when `pipCmdExtraArgs` isn't a list, or an item parsed as a YAML map or number. Quote each item, as in [Linux wheels without Docker](#linux-wheels-without-docker).

### Installs with a Homebrew Python

If pip installs from a Homebrew Python don't work with the `--target` directory the Framework uses, set [`pythonBin`](#set-the-python-interpreter) to a Python from [python.org](https://www.python.org/downloads/) or pyenv, run the deploy inside an activated virtual environment, or use [`dockerizePip`](#build-linux-dependencies-on-macos-and-windows).

## Related

- [Packaging](./packaging.md) for `package.patterns` and `package.individually`
- [Layers](./layers.md) for layer settings
- [Working with .zip file archives for Python Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html) in the AWS Lambda developer guide
