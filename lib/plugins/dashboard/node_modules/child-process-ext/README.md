[![Build status][build-image]][build-url]
[![Tests coverage][cov-image]][cov-url]
[![npm version][npm-image]][npm-url]

# child-process-ext

## [Node.js `child_process`](https://nodejs.org/api/child_process..html) extensions

### Installation

```bash
npm install child-process-ext
```

### API

#### `spawn(command[, args[, options]])`

Cross system compliant [`spawn`](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options) (backed by [`cross-spawn`](https://www.npmjs.com/package/cross-spawn)).

Works exactly same way as node's [`spawn`](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options) with difference that promise is returned that resolves once process exits.

Following properties are exposed on return promise:

- `child` - child process
- `stdout` - stdout stream (decorated so it can also be used as promise)
- `stderr` - stderr stream (decorated so it can also be used as promise)
- `std` - Merged stdout & stderr stream (decorated so it can also be used as promise)
- `stdoutBuffer` - Buffer that exposes so far written `stdout`
- `stderrBuffer` - Buffer that exposes so far written `stderrr`
- `stdBuffer` - Buffer that exposes so far written `std`

Promise resolves with object with three properties:

- `code` - Exit code of a child proces
- `signal` - Signal that terminated the process
- `stdoutBuffer` - Buffer containing gathered `stdout` content
- `stderrBuffer` - Buffer containing gathered `stderr` content
- `stdBuffer` - Buffer containing gathered `stderr` content

If process exits with non zero code, then promise is rejected with an error exposing same properties as above

##### Non standard options

###### split `bool` (default: `false`)

Whether stdout data should be split by lines. If set to `true`, then `stdout` and `stderr` on promise expose mappers of original `stdout` and `stderr` that emit each line with distinct `data` event

###### shouldCloseStdin `bool` (default: `false`)

Whether stdin should be closed. Applicable for spawned processes where `stdin` is set to other than `'inherit'` mode, and underlying processes is reading from `stdin`. Not providing any `stdin` output, may produce stall if process logic waits for an input.
_See: [get-stdin#13](https://github.com/sindresorhus/get-stdin/issues/13#issuecomment-279234249) for more information_

### Tests

```bash
npm test
```

[build-image]: https://github.com/medikoo/child-process-ext/workflows/Integrate/badge.svg
[build-url]: https://github.com/medikoo/child-process-ext/actions?query=workflow%3AIntegrate
[cov-image]: https://img.shields.io/codecov/c/github/medikoo/child-process-ext.svg
[cov-url]: https://codecov.io/gh/medikoo/child-process-ext
[npm-image]: https://img.shields.io/npm/v/child-process-ext.svg
[npm-url]: https://www.npmjs.com/package/child-process-ext
