wrench.js - Recursive file operations in Node.js
----------------------------------------------------------------------------
While I love Node.js, I've found myself missing some functions. Things like
recursively deleting/chmodding a directory (or even deep copying a directory),
or even a basic line reader, shouldn't need to be re-invented time and time again.

That said, here's my attempt at a re-usable solution, at least until something
more formalized gets integrated into Node.js (*hint hint*). wrench.js is fairly simple
to use - check out the documentation/examples below:

Possibly Breaking Change in v1.5.0
-----------------------------------------------------------------------------
In previous versions of Wrench, we went against the OS-default behavior of not
deleting a directory unless the operation is forced. In 1.5.0, this has been
changed to be the behavior people expect there to be - if you try to copy over
a directory that already exists, you'll get an Error returned or thrown stating
that you need to force it.

Something like this will do the trick:

``` javascript
wrench.copyDirSyncRecursive('directory_to_copy', 'location_where_copy_should_end_up', {
    forceDelete: true
});
```

If you desire the older behavior of Wrench... hit up your package.json. If you
happen to find bugs in the 1.5.0 release please feel free to file them on the 
GitHub issues tracker for this project, or send me a pull request and I'll get to
it as fast as I can. Thanks!

**If this breaks enough projects I will consider rolling it back. Please hit me up if this seems to be the case.**

Installation
-----------------------------------------------------------------------------

    npm install wrench

Usage
-----------------------------------------------------------------------------
``` javascript
var wrench = require('wrench'),
	util = require('util');
```

### Synchronous operations
``` javascript
// Recursively create directories, sub-trees and all.
wrench.mkdirSyncRecursive(dir, 0777);

// Recursively delete the entire sub-tree of a directory, then kill the directory
wrench.rmdirSyncRecursive('my_directory_name', failSilently);

// Recursively read directories contents.
wrench.readdirSyncRecursive('my_directory_name');

// Recursively chmod the entire sub-tree of a directory
wrench.chmodSyncRecursive('my_directory_name', 0755);

// Recursively chown the entire sub-tree of a directory
wrench.chownSyncRecursive("directory", uid, gid);

// Deep-copy an existing directory
wrench.copyDirSyncRecursive('directory_to_copy', 'location_where_copy_should_end_up', {
    forceDelete: bool, // Whether to overwrite existing directory or not
    excludeHiddenUnix: bool, // Whether to copy hidden Unix files or not (preceding .)
    preserveFiles: bool, // If we're overwriting something and the file already exists, keep the existing
    preserveTimestamps: bool, // Preserve the mtime and atime when copying files
    inflateSymlinks: bool, // Whether to follow symlinks or not when copying files
    filter: regexpOrFunction, // A filter to match files against; if matches, do nothing (exclude).
    whitelist: bool, // if true every file or directory which doesn't match filter will be ignored
    include: regexpOrFunction, // An include filter (either a regexp or a function)
    exclude: regexpOrFunction // An exclude filter (either a regexp or a function)
});

// Note: If a RegExp is provided then then it will be matched against the filename. If a function is
//       provided then the signature should be the following:
//       function(filename, dir) { return result; }

// Read lines in from a file until you hit the end
var f = new wrench.LineReader('x.txt');
while(f.hasNextLine()) {
	util.puts(f.getNextLine());
}

// Note: You will need to close that above line reader at some point, otherwise
// you will run into a "too many open files" error. f.close() or fs.closeSync(f.fd) are
// your friends, as only you know when it is safe to close.
```

### Asynchronous operations
``` javascript
// Recursively read directories contents
var files = [];
wrench.readdirRecursive('my_directory_name', function(error, curFiles) {
    // curFiles is what you want
});

// If you're feeling somewhat masochistic
wrench.copyDirRecursive(srcDir, newDir, {forceDelete: bool /* See sync version */}, callbackfn);
```

Questions, comments? Hit me up. (ryan [at] venodesigns.net | http://twitter.com/ryanmcgrath)
