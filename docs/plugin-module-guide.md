# JAWS plug-in module guide

JAWS is exteremly modular by design.  JAWS-modules must include code and a [jaws.json](./jaws-json.md) file.  jaws-modules differ from npm-modules in that they are mostly “templates”.  Since they are merely templates, we don’t need versioning and dependency management, so you can simply install them from their github url using jaws install `<github url>`.

The convention is to have a directory per lambda, under a resource dir in your `back` folder.  

Check out the [JAWS test project](../tests/test-prj) that shows off the modular philosophy of JAWS.
