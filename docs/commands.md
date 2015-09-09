# JAWS CLI Commands

## install

The `jaws install` command downloads the JAWS-module from the location specified (a github repo) and installs it.  The install includes:

*  If the `--save` flag was used and if `cfExtensions` CloudFormation template was included in the module’s [`jaws.json`](./jaws-json.md), it merges the contents into the project’s [`jaws-cf.json`](./jaws-cf-json.md).  You will have to manually divide this up into multiple CF templates afterwards, if that’s your preference.
*  Copies the jaws-module into the `back/lambdas` dir of the project you are currently in


