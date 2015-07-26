# Merge Descriptors

Merge objects using descriptors.

```js
var thing = {
  get name() {
    return 'jon'
  }
}

var animal = {

}

merge(animal, thing)

animal.name === 'jon'
```

## API

### merge(destination, source)

Redefines `destination`'s descriptors with `source`'s.

### merge(destination, source, false)

Defines `source`'s descriptors on `destination` if `destination` does not have
a descriptor by the same name.

## License

[MIT](LICENSE)
