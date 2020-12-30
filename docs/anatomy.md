# Anatomy - Overview of internals

## `serverless` binary (front door for three distinct CLI programs)

[`serverless` binary](https://github.com/serverless/serverless/blob/master/bin/serverless.js) serves as an entrance for three independent CLI programs. [Initial logic](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/bin/serverless.js#L25-L38) decides which CLI is actually run in current working directory context. Possible options are listed below

### 1. Serverless Framework CLI

Documented at [serverless.com/framework/docs](https://www.serverless.com/framework/docs/) of which code is hosted in this repository.

See [Anatomy of the Serverless Framework CLI](#anatomy-of-the-serverless-framework-cli)

### 2. (old v1 of) Serverless Components CLI

_Deprecated old version of Serverless Components_

Documented at [serverless/components/blob/v1](https://github.com/serverless/components/blob/v1/README.md), with code hosted at [serverless/cli](https://github.com/serverless/cli)

### 3. Serverless Components CLI

Documented at [serverless.com/components](https://www.serverless.com/components/), with code hosted at [serverless/components](https://github.com/serverless/components)

## Anatomy of the Serverless Framework CLI

### Overview

Core flow of a process is managed through internal lifecycle engine, for which, internal (core) and external (user-made) plugins register supported CLI commands attributing to them ordered lifecycle events, plus hooks (event listeners) which are invoked when given event is triggered.

#### Code organization

Internals are configured with following modules.

_Note: that each of these modules are considered private, there should be no dependency on them in external packages. Organization of files and internal API is subject to constant changes_

##### Core classes

Located in [lib/classes](https://github.com/serverless/serverless/tree/master/lib/classes). Core machinery with lifecycle engine internals

##### Internal plugins

Located in [lib/plugins](https://github.com/serverless/serverless/tree/master/lib/plugins). Register and implement core CLI commands with its events and attaches hooks for registered events

##### Utils

Located in [lib/utils](https://github.com/serverless/serverless/tree/master/lib/utils). General utils to be used in either core classes or internal plugins

### Flow of a CLI process

1. Setup essentials related to general error handling and eventual debugging ([bin/serverless.js#L40-L56](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/bin/serverless.js#L40-L56))
1. Setup autocompletion (only if explicitly turned on) ([bin/serverless.js#L58-L61](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/bin/serverless.js#L58-L61))
1. Propagate eventual analytics requests which weren't successful in previous runs ([bin/serverless.js#L64-L66](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/bin/serverless.js#L64-L66))
1. Resolve location of eventual service configuration in current working directory ([lib/Serverless.js#L40-L42](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/Serverless.js#L40-L42))
1. Parse CLI arguments ([lib/Serverless.js#L67](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/Serverless.js#L67))
1. (If in service context) Read service configuration (just read, no normalization and variables resolution at this point) ([lib/classes/PluginManager.js#L60-L63](https://github.com/serverless/serverless/blob/master/lib/classes/PluginManager.js#L60-L63))
1. Check whether there's a newer version of a Framework available, and notify user if there is ([Serverless.js#L79-L89](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/Serverless.js#L79-L89))
1. (If in service context) Normalize service configuration by filling defaults and ensuring core structure (no variables resolution yet) ([lib/classes/Service.js#L38-L53](https://github.com/serverless/serverless/blob/master/lib/classes/Service.js#L38-L53))
1. Load all plugins (internal and those installed by user). They configure supported CLI commands, register events for lifecycle engine, and attach hooks to events eventually triggered by lifecycle engine ([lib/classes/PluginManager.js#L107-L116](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/classes/PluginManager.js#L107-L116)
1. If it's `sls --help` command, show help and abort ([lib/Serverless.js#L108-L110](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/Serverless.js#L108-L110)
1. (If in service context) Populate all variables in service configuration ([lib/Serverless.js#L118-L125](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/Serverless.js#L118-L125))
1. (if in service context) Validate service configuration ([lib/Serverless.js#L128](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/Serverless.js#L128)
1. Run lifecycle engine (emit all events that were registered for invoked CLI command) ([lib/classes/PluginManager.js#L509-L511](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/classes/PluginManager.js#L509-L511))
1. If execution ended with an error, log it in user friendly way ([lib/classes/Error.js#L68-L129](https://github.com/serverless/serverless/blob/ce376e96b0bb15a06ade362134aee2b1848d6113/lib/classes/Error.js#L68-L129))
