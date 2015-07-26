/*  wrench.js
 *
 *  A collection of various utility functions I've found myself in need of
 *  for use with Node.js (http://nodejs.org/). This includes things like:
 *
 *  - Recursively deleting directories in Node.js (Sync, not Async)
 *  - Recursively copying directories in Node.js (Sync, not Async)
 *  - Recursively chmoding a directory structure from Node.js (Sync, not Async)
 *  - Other things that I'll add here as time goes on. Shhhh...
 *
 *  ~ Ryan McGrath (ryan [at] venodesigns.net)
 */

var fs = require("fs"),
    _path = require("path"),
    isWindows = !!process.platform.match(/^win/);

/*  wrench.readdirSyncRecursive("directory_path");
 *
 *  Recursively dives through directories and read the contents of all the
 *  children directories.
 */
exports.readdirSyncRecursive = function(baseDir) {
    baseDir = baseDir.replace(/\/$/, '');

    var readdirSyncRecursive = function(baseDir) {
        var files = [],
            curFiles,
            nextDirs,
            isDir = function(fname){
                return fs.existsSync(_path.join(baseDir, fname)) ? fs.statSync( _path.join(baseDir, fname) ).isDirectory() : false;
            },
            prependBaseDir = function(fname){
                return _path.join(baseDir, fname);
            };

        curFiles = fs.readdirSync(baseDir);
        nextDirs = curFiles.filter(isDir);
        curFiles = curFiles.map(prependBaseDir);

        files = files.concat( curFiles );

        while (nextDirs.length) {
            files = files.concat( readdirSyncRecursive( _path.join(baseDir, nextDirs.shift()) ) );
        }

        return files;
    };

    // convert absolute paths to relative
    var fileList = readdirSyncRecursive(baseDir).map(function(val){
        return _path.relative(baseDir, val);
    });

    return fileList;
};

/*  wrench.readdirRecursive("directory_path", function(error, files) {});
 *
 *  Recursively dives through directories and read the contents of all the
 *  children directories.
 *
 *  Asynchronous, so returns results/error in callback.
 *  Callback receives the of files in currently recursed directory.
 *  When no more directories are left, callback is called with null for all arguments.
 *
 */
exports.readdirRecursive = function(baseDir, fn) {
    baseDir = baseDir.replace(/\/$/, '');

    var waitCount = 0;

    function readdirRecursive(curDir) {
        var prependcurDir = function(fname){
            return _path.join(curDir, fname);
        };

        waitCount++;
        fs.readdir(curDir, function(e, curFiles) {
            if (e) {
                fn(e);
                return;
            }
            waitCount--;

            curFiles = curFiles.map(prependcurDir);

            curFiles.forEach(function(it) {
                waitCount++;

                fs.stat(it, function(e, stat) {
                    waitCount--;

                    if (e) {
                        fn(e);
                    } else {
                        if (stat.isDirectory()) {
                            readdirRecursive(it);
                        }
                    }

                    if (waitCount == 0) {
                        fn(null, null);
                    }
                });
            });

            fn(null, curFiles.map(function(val) {
                // convert absolute paths to relative
                return _path.relative(baseDir, val);
            }));

            if (waitCount == 0) {
                fn(null, null);
            }
        });
    };

    readdirRecursive(baseDir);
};





/*  wrench.rmdirSyncRecursive("directory_path", failSilent);
 *
 *  Recursively dives through directories and obliterates everything about it. This is a
 *  Sync-function, which blocks things until it's done. No idea why anybody would want an
 *  Asynchronous version. :\
 */
exports.rmdirSyncRecursive = function(path, failSilent) {
    var files;

    try {
        files = fs.readdirSync(path);
    } catch (err) {

        if(failSilent) return;
        throw new Error(err.message);
    }

    /*  Loop through and delete everything in the sub-tree after checking it */
    for(var i = 0; i < files.length; i++) {
        var file = _path.join(path, files[i]);
        var currFile = fs.lstatSync(file);

        if(currFile.isDirectory())  {
            // Recursive function back to the beginning
            exports.rmdirSyncRecursive(file);
        } else if(currFile.isSymbolicLink()) {
            // Unlink symlinks
            if (isWindows) {
                fs.chmodSync(file, 666) // Windows needs this unless joyent/node#3006 is resolved..
            }

            fs.unlinkSync(file);
        } else {
            // Assume it's a file - perhaps a try/catch belongs here?
            if (isWindows) {
                fs.chmodSync(file, 666) // Windows needs this unless joyent/node#3006 is resolved..
            }

            fs.unlinkSync(file);
        }
    }

    /*  Now that we know everything in the sub-tree has been deleted, we can delete the main
     directory. Huzzah for the shopkeep. */
    return fs.rmdirSync(path);
};



function isFileIncluded(opts, dir, filename) {

    function isMatch(filter) {
        if (typeof filter === 'function') {
            return filter(filename, dir) === true;
        }
        else {
            // Maintain backwards compatibility and use just the filename
            return filename.match(filter);
        }
    }

    if (opts.include || opts.exclude) {
        if (opts.exclude) {
            if (isMatch(opts.exclude)) {
                return false;
            }
        }

        if (opts.include) {
            if (isMatch(opts.include)) {
                return true;
            }
            else  {
                return false;
            }
        }

        return true;
    }
    else if (opts.filter) {
        var filter = opts.filter;

        if (!opts.whitelist) {
            // if !opts.whitelist is false every file or directory 
            // which does match opts.filter will be ignored
            return isMatch(filter) ? false : true;
        } else {
            // if opts.whitelist is true every file or directory 
            // which doesn't match opts.filter will be ignored
            return !isMatch(filter) ? false : true;
        }
    }

    return true;
}

/*  wrench.copyDirSyncRecursive("directory_to_copy", "new_directory_location", opts);
 *
 *  Recursively dives through a directory and moves all its files to a new location. This is a
 *  Synchronous function, which blocks things until it's done. If you need/want to do this in
 *  an Asynchronous manner, look at wrench.copyDirRecursively() below. Specify forceDelete to force directory overwrite.
 *
 *  Note: Directories should be passed to this function without a trailing slash.
 */
exports.copyDirSyncRecursive = function(sourceDir, newDirLocation, opts) {
    opts = opts || {};

    try {
        if(fs.statSync(newDirLocation).isDirectory()) { 
            if(opts.forceDelete) {
            exports.rmdirSyncRecursive(newDirLocation);
            } else {
                return new Error('You are trying to delete a directory that already exists. Specify forceDelete in the opts argument to override this. Bailing~');
            }
        }
    } catch(e) { }

    /*  Create the directory where all our junk is moving to; read the mode of the source directory and mirror it */
    var checkDir = fs.statSync(sourceDir);
    try {
        fs.mkdirSync(newDirLocation, checkDir.mode);
    } catch (e) {
        //if the directory already exists, that's okay
        if (e.code !== 'EEXIST') throw e;
    }

    var files = fs.readdirSync(sourceDir);
    var hasFilter = opts.filter || opts.include || opts.exclude;
    var preserveFiles = opts.preserveFiles === true;
    var preserveTimestamps = opts.preserveTimestamps === true;

    for(var i = 0; i < files.length; i++) {
        // ignores all files or directories which match the RegExp in opts.filter
        if(typeof opts !== 'undefined') {
            if (hasFilter) {
                if (!isFileIncluded(opts, sourceDir, files[i])) {
                    continue;
                }
            }
            
            if (opts.excludeHiddenUnix && /^\./.test(files[i])) continue;
        }

        var currFile = fs.lstatSync(_path.join(sourceDir, files[i]));

        var fCopyFile = function(srcFile, destFile) {
            if(typeof opts !== 'undefined' && opts.preserveFiles && fs.existsSync(destFile)) return;

            var contents = fs.readFileSync(srcFile);
            fs.writeFileSync(destFile, contents);
            var stat =  fs.lstatSync(srcFile);
            fs.chmodSync(destFile, stat.mode);
            if (preserveTimestamps) {
                fs.utimesSync(destFile, stat.atime, stat.mtime)
            }
        };

        if(currFile.isDirectory()) {
            /*  recursion this thing right on back. */
            exports.copyDirSyncRecursive(_path.join(sourceDir, files[i]), _path.join(newDirLocation, files[i]), opts);
        } else if(currFile.isSymbolicLink()) {
            var symlinkFull = fs.readlinkSync(_path.join(sourceDir, files[i]));
            symlinkFull = _path.resolve(fs.realpathSync(sourceDir), symlinkFull);

            if (typeof opts !== 'undefined' && !opts.inflateSymlinks) {
                fs.symlinkSync(symlinkFull, _path.join(newDirLocation, files[i]));
                continue;
            }

            var tmpCurrFile = fs.lstatSync(symlinkFull);
            if (tmpCurrFile.isDirectory()) {
                exports.copyDirSyncRecursive(symlinkFull, _path.join(newDirLocation, files[i]), opts);
            } else {
                /*  At this point, we've hit a file actually worth copying... so copy it on over. */
                fCopyFile(symlinkFull, _path.join(newDirLocation, files[i]));
            }
        } else {
            /*  At this point, we've hit a file actually worth copying... so copy it on over. */
            fCopyFile(_path.join(sourceDir, files[i]), _path.join(newDirLocation, files[i]));
        }
    }
};

/*  wrench.chmodSyncRecursive("directory", filemode);
 *
 *  Recursively dives through a directory and chmods everything to the desired mode. This is a
 *  Synchronous function, which blocks things until it's done.
 *
 *  Note: Directories should be passed to this function without a trailing slash.
 */
exports.chmodSyncRecursive = function(sourceDir, filemode) {
    var files = fs.readdirSync(sourceDir);

    for(var i = 0; i < files.length; i++) {
        var currFile = fs.lstatSync(_path.join(sourceDir, files[i]));

        if(currFile.isDirectory()) {
            /*  ...and recursion this thing right on back. */
            exports.chmodSyncRecursive(_path.join(sourceDir, files[i]), filemode);
        } else {
            /*  At this point, we've hit a file actually worth copying... so copy it on over. */
            fs.chmod(_path.join(sourceDir, files[i]), filemode);
        }
    }

    /*  Finally, chmod the parent directory */
    fs.chmod(sourceDir, filemode);
};


/*  wrench.chownSyncRecursive("directory", uid, gid);
 *
 *  Recursively dives through a directory and chowns everything to the desired user and group. This is a
 *  Synchronous function, which blocks things until it's done.
 *
 *  Note: Directories should be passed to this function without a trailing slash.
 */
exports.chownSyncRecursive = function(sourceDir, uid, gid) {
    var files = fs.readdirSync(sourceDir);

    for(var i = 0; i < files.length; i++) {
        var currFile = fs.lstatSync(_path.join(sourceDir, files[i]));

        if(currFile.isDirectory()) {
            /*  ...and recursion this thing right on back. */
            exports.chownSyncRecursive(_path.join(sourceDir, files[i]), uid, gid);
        } else {
            /*  At this point, we've hit a file actually worth chowning... so own it. */
            fs.chownSync(_path.join(sourceDir, files[i]), uid, gid);
        }
    }

    /*  Finally, chown the parent directory */
    fs.chownSync(sourceDir, uid, gid);
};



/*  wrench.rmdirRecursive("directory_path", callback);
 *
 *  Recursively dives through directories and obliterates everything about it.
 */
exports.rmdirRecursive = function rmdirRecursive(dir, failSilent, clbk){
    if(clbk === null || typeof clbk == 'undefined')
        clbk = function(err) {};

    fs.readdir(dir, function(err, files) {
        if(err && typeof failSilent === 'boolean' && !failSilent) 
        return clbk(err);

        if(typeof failSilent === 'function')
            clbk = failSilent;
        
        (function rmFile(err){
            if (err) return clbk(err);

            var filename = files.shift();
            if (filename === null || typeof filename == 'undefined')
                return fs.rmdir(dir, clbk);

            var file = dir+'/'+filename;
            fs.lstat(file, function(err, stat){
                if (err) return clbk(err);
                if (stat.isDirectory())
                    rmdirRecursive(file, rmFile);
                else
                    fs.unlink(file, rmFile);
            });
        })();
    });
};

/*  wrench.copyDirRecursive("directory_to_copy", "new_location", {forceDelete: bool}, callback);
 *
 *  Recursively dives through a directory and moves all its files to a new
 *  location. Specify forceDelete to force directory overwrite.
 *
 *  Note: Directories should be passed to this function without a trailing slash.
 */
exports.copyDirRecursive = function copyDirRecursive(srcDir, newDir, opts, clbk) {
    var originalArguments = Array.prototype.slice.apply(arguments);
    srcDir = _path.normalize(srcDir);
    newDir = _path.normalize(newDir);

    fs.stat(newDir, function(err, newDirStat) {
        if(!err) {
            if(typeof opts !== 'undefined' && typeof opts !== 'function' && opts.forceDelete)
                return exports.rmdirRecursive(newDir, function(err) {
                    copyDirRecursive.apply(this, originalArguments);
                });
            else
                return clbk(new Error('You are trying to delete a directory that already exists. Specify forceDelete in an options object to override this.'));
        }

	if(typeof opts === 'function')
		clbk = opts;

        fs.stat(srcDir, function(err, srcDirStat){
            if (err) return clbk(err);
            fs.mkdir(newDir, srcDirStat.mode, function(err){
                if (err) return clbk(err);
                fs.readdir(srcDir, function(err, files){
                    if (err) return clbk(err);
                    (function copyFiles(err){
                        if (err) return clbk(err);

                        var filename = files.shift();
                        if (filename === null || typeof filename == 'undefined')
                            return clbk(null);

                        var file = srcDir+'/'+filename,
                            newFile = newDir+'/'+filename;

                        fs.stat(file, function(err, fileStat){
                            if (err) return clbk(err);
                            if (fileStat.isDirectory())
                                copyDirRecursive(file, newFile, copyFiles, clbk);
                            else if (fileStat.isSymbolicLink())
                                fs.readlink(file, function(err, link){
                                    if (err) return clbk(err);
                                    fs.symlink(link, newFile, copyFiles);
                                });
                            else
                                fs.readFile(file, function(err, data){
                                    if (err) return clbk(err);
                                    fs.writeFile(newFile, data, copyFiles);
                                });
                        });
                    })();
                });
            });
        });
    });
};

var mkdirSyncRecursive = function(path, mode) {
    var self = this;
    path = _path.normalize(path)

    try {
        fs.mkdirSync(path, mode);
    } catch(err) {
        if(err.code == "ENOENT") {
            var slashIdx = path.lastIndexOf(_path.sep);

            if(slashIdx > 0) {
                var parentPath = path.substring(0, slashIdx);
                mkdirSyncRecursive(parentPath, mode);
                mkdirSyncRecursive(path, mode);
            } else {
                throw err;
            }
        } else if(err.code == "EEXIST") {
            return;
        } else {
            throw err;
        }
    }
};
exports.mkdirSyncRecursive = mkdirSyncRecursive;

exports.LineReader = function(filename, bufferSize) {
    this.bufferSize = bufferSize || 8192;
    this.buffer = "";
    this.fd = fs.openSync(filename, "r");
    this.currentPosition = 0;
};

exports.LineReader.prototype = {
    close: function() {
        return fs.closeSync(this.fd);
    },

    getBufferAndSetCurrentPosition: function(position) {
        var res = fs.readSync(this.fd, this.bufferSize, position, "ascii");

        this.buffer += res[0];
        if(res[1] === 0) {
            this.currentPosition = -1;
        } else {
            this.currentPosition = position + res[1];
        }

        return this.currentPosition;
    },

    hasNextLine: function() {
        while(this.buffer.indexOf('\n') === -1) {
            this.getBufferAndSetCurrentPosition(this.currentPosition);
            if(this.currentPosition === -1) return false;
        }

        if(this.buffer.indexOf("\n") > -1 || this.buffer.length !== 0) return true;
        return false;
    },

    getNextLine: function() {
        var lineEnd = this.buffer.indexOf("\n"),
            result = this.buffer.substring(0, lineEnd != -1 ? lineEnd : this.buffer.length);

        this.buffer = this.buffer.substring(result.length + 1, this.buffer.length);
        return result;
    }
};

// vim: et ts=4 sw=4
