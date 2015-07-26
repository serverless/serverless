# Bytes utility

Utility to parse a string bytes (ex: `1TB`) to bytes (`1099511627776`) and vice-versa.

## Usage

```js
var bytes = require('bytes');
```

#### bytes.format(number value, [options]): string|null

Format the given value in bytes into a string. If the value is negative, it is kept as such. If it is a float, it is
 rounded.

**Arguments**

| Name    | Type   | Description        |
|---------|--------|--------------------|
| value   | `number` | Value in bytes     |
| options | `Object` | Conversion options |

**Options**

| Property          | Type   | Description                                                                             |
|-------------------|--------|-----------------------------------------------------------------------------------------|
| thousandsSeparator | `string`&#124;`null` | Example of values: `' '`, `','` and `.`... Default value to `' '`. |

**Returns**

| Name    | Type        | Description             |
|---------|-------------|-------------------------|
| results | `string`&#124;`null` | Return null upon error. String value otherwise. |

**Example**

```js
bytes(1024);
// output: '1kB'

bytes(1000);
// output: '1000B'

bytes(1000, {thousandsSeparator: ' '});
// output: '1 000B'
```

#### bytes.parse(string value): number|null

Parse the string value into an integer in bytes. If no unit is given, it is assumed the value is in bytes.

**Arguments**

| Name          | Type   | Description        |
|---------------|--------|--------------------|
| value   | `string` | String to parse.   |

**Returns**

| Name    | Type        | Description             |
|---------|-------------|-------------------------|
| results | `number`&#124;`null` | Return null upon error. Value in bytes otherwise. |

**Example**

```js
bytes('1kB');
// output: 1024

bytes('1024');
// output: 1024
```

## Installation

```bash
npm install bytes --save
component install visionmedia/bytes.js
```

## License 

[![npm](https://img.shields.io/npm/l/express.svg)](https://github.com/visionmedia/bytes.js/blob/master/LICENSE)
