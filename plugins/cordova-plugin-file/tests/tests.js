/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

/* jshint jasmine: true */
/* global WebKitBlobBuilder */

exports.defineAutoTests = function () {
    var isBrowser = (cordova.platformId === "browser");
    // Use feature detection to determine current browser instead of checking user-agent
    var isChrome = isBrowser && window.webkitRequestFileSystem && window.webkitResolveLocalFileSystemURL;
    var isIE = isBrowser && (window.msIndexedDB);
    var isIndexedDBShim = isBrowser && !isChrome;   // Firefox and IE for example

    var isWindows = (cordova.platformId === "windows" || cordova.platformId === "windows8");

    var MEDIUM_TIMEOUT = 15000;

    describe('File API', function () {
        // Adding a Jasmine helper matcher, to report errors when comparing to FileError better.
        var fileErrorMap = {
            1 : 'NOT_FOUND_ERR',
            2 : 'SECURITY_ERR',
            3 : 'ABORT_ERR',
            4 : 'NOT_READABLE_ERR',
            5 : 'ENCODING_ERR',
            6 : 'NO_MODIFICATION_ALLOWED_ERR',
            7 : 'INVALID_STATE_ERR',
            8 : 'SYNTAX_ERR',
            9 : 'INVALID_MODIFICATION_ERR',
            10 : 'QUOTA_EXCEEDED_ERR',
            11 : 'TYPE_MISMATCH_ERR',
            12 : 'PATH_EXISTS_ERR'
        },
        root,
        temp_root,
        persistent_root;
        beforeEach(function (done) {
            // Custom Matchers
            jasmine.Expectation.addMatchers({
                toBeFileError : function () {
                    return {
                        compare : function (error, code) {
                            var pass = error.code === code;
                            return {
                                pass : pass,
                                message : 'Expected FileError with code ' + fileErrorMap[error.code] + ' (' + error.code + ') to be ' + fileErrorMap[code] + '(' + code + ')'
                            };
                        }
                    };
                },
                toCanonicallyMatch : function () {
                    return {
                        compare : function (currentPath, path) {
                            var a = path.split("/").join("").split("\\").join(""),
                            b = currentPath.split("/").join("").split("\\").join(""),
                            pass = a === b;
                            return {
                                pass : pass,
                                message : 'Expected paths to match : ' + path + ' should be ' + currentPath
                            };
                        }
                    };
                },
                toFailWithMessage : function () {
                    return {
                        compare : function (error, message) {
                            var pass = false;
                            return {
                                pass : pass,
                                message : message
                            };
                        }
                    };
                },
                toBeDataUrl: function () {
                    return {
                        compare : function (url) {
                            var pass = false;
                            // "data:application/octet-stream;base64,"
                            var header = url.substr(0, url.indexOf(','));
                            var headerParts = header.split(/[:;]/);
                            if (headerParts.length === 3 &&
                                headerParts[0] === 'data' &&
                                headerParts[2] === 'base64') {
                                pass = true;
                            }
                            var message = 'Expected ' + url + ' to be a valid data url. ' + header + ' is not valid header for data uris';
                            return {
                                pass : pass,
                                message : message
                            };
                        }
                    };
                }
            });
            //Define global variables
            var onError = function (e) {
                console.log('[ERROR] Problem setting up root filesystem for test running! Error to follow.');
                console.log(JSON.stringify(e));
            };
            window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function (fileSystem) {
                root = fileSystem.root;
                // set in file.tests.js
                persistent_root = root;
                window.requestFileSystem(LocalFileSystem.TEMPORARY, 0, function (fileSystem) {
                    temp_root = fileSystem.root;
                    // set in file.tests.js
                    done();
                }, onError);
            }, onError);
        });
        // HELPER FUNCTIONS
        // deletes specified file or directory
        var deleteEntry = function (name, success, error) {
            // deletes entry, if it exists
            // entry.remove success callback is required: http://www.w3.org/TR/2011/WD-file-system-api-20110419/#the-entry-interface
            success = success || function() {};
            error = error || failed.bind(null, success, 'deleteEntry failed.');

            window.resolveLocalFileSystemURL(root.toURL() + '/' + name, function (entry) {
                if (entry.isDirectory === true) {
                    entry.removeRecursively(success, error);
                } else {
                    entry.remove(success, error);
                }
            }, success);
        };
        // deletes file, if it exists, then invokes callback
        var deleteFile = function (fileName, callback) {
            // entry.remove success callback is required: http://www.w3.org/TR/2011/WD-file-system-api-20110419/#the-entry-interface
            callback = callback || function() {};

            root.getFile(fileName, null, // remove file system entry
                function (entry) {
                entry.remove(callback, function () {
                    console.log('[ERROR] deleteFile cleanup method invoked fail callback.');
                });
            }, // doesn't exist
                callback);
        };
        // deletes and re-creates the specified file
        var createFile = function (fileName, success, error) {
            deleteEntry(fileName, function () {
                root.getFile(fileName, {
                    create : true
                }, success, error);
            }, error);
        };
        // deletes and re-creates the specified directory
        var createDirectory = function (dirName, success, error) {
            deleteEntry(dirName, function () {
                root.getDirectory(dirName, {
                    create : true
                }, success, error);
            }, error);
        };
        function failed(done, msg, error) {
            var info = typeof msg == 'undefined' ? 'Unexpected error callback' : msg;
            var codeMsg = (error && error.code) ? (': ' + fileErrorMap[error.code]) : '';
            expect(true).toFailWithMessage(info + '\n' + JSON.stringify(error) + codeMsg);
            done();
        }
        var succeed = function (done, msg) {
            var info = typeof msg == 'undefined' ? 'Unexpected success callback' : msg;
            expect(true).toFailWithMessage(info);
            done();
        };
        var joinURL = function (base, extension) {
            if (base.charAt(base.length - 1) !== '/' && extension.charAt(0) !== '/') {
                return base + '/' + extension;
            }
            if (base.charAt(base.length - 1) === '/' && extension.charAt(0) === '/') {
                return base + extension.substring(1);
            }
            return base + extension;
        };
        describe('FileError object', function () {
            it("file.spec.1 should define FileError constants", function () {
                expect(FileError.NOT_FOUND_ERR).toBe(1);
                expect(FileError.SECURITY_ERR).toBe(2);
                expect(FileError.ABORT_ERR).toBe(3);
                expect(FileError.NOT_READABLE_ERR).toBe(4);
                expect(FileError.ENCODING_ERR).toBe(5);
                expect(FileError.NO_MODIFICATION_ALLOWED_ERR).toBe(6);
                expect(FileError.INVALID_STATE_ERR).toBe(7);
                expect(FileError.SYNTAX_ERR).toBe(8);
                expect(FileError.INVALID_MODIFICATION_ERR).toBe(9);
                expect(FileError.QUOTA_EXCEEDED_ERR).toBe(10);
                expect(FileError.TYPE_MISMATCH_ERR).toBe(11);
                expect(FileError.PATH_EXISTS_ERR).toBe(12);
            });
        });
        describe('LocalFileSystem', function () {
            it("file.spec.2 should define LocalFileSystem constants", function () {
                expect(LocalFileSystem.TEMPORARY).toBe(0);
                expect(LocalFileSystem.PERSISTENT).toBe(1);
            });
            describe('window.requestFileSystem', function () {
                it("file.spec.3 should be defined", function () {
                    expect(window.requestFileSystem).toBeDefined();
                });
                it("file.spec.4 should be able to retrieve a PERSISTENT file system", function (done) {
                    var win = function (fileSystem) {
                        expect(fileSystem).toBeDefined();
                        expect(fileSystem.name).toBeDefined();
                        if (isChrome) {
                            expect(fileSystem.name).toContain("Persistent");
                        } else {
                            expect(fileSystem.name).toBe("persistent");
                        }
                        expect(fileSystem.root).toBeDefined();
                        expect(fileSystem.root.filesystem).toBeDefined();
                        // Shouldn't use cdvfile by default.
                        expect(fileSystem.root.toURL()).not.toMatch(/^cdvfile:/);
                        // All DirectoryEntry URLs should always have a trailing slash.
                        expect(fileSystem.root.toURL()).toMatch(/\/$/);
                        done();
                    };

                    // Request a little bit of space on the filesystem, unless we're running in a browser where that could cause a prompt.
                    var spaceRequired = isBrowser ? 0 : 1024;

                    // retrieve PERSISTENT file system
                    window.requestFileSystem(LocalFileSystem.PERSISTENT, spaceRequired, win, failed.bind(null, done, 'window.requestFileSystem - Error retrieving PERSISTENT file system'));
                });
                it("file.spec.5 should be able to retrieve a TEMPORARY file system", function (done) {
                    var win = function (fileSystem) {
                        expect(fileSystem).toBeDefined();
                        if (isChrome) {
                            expect(fileSystem.name).toContain("Temporary");
                        } else {
                            expect(fileSystem.name).toBe("temporary");
                        }
                        expect(fileSystem.root).toBeDefined();
                        expect(fileSystem.root.filesystem).toBeDefined();
                        expect(fileSystem.root.filesystem).toBe(fileSystem);
                        done();
                    };
                    //retrieve TEMPORARY file system
                    window.requestFileSystem(LocalFileSystem.TEMPORARY, 0, win, failed.bind(null, done, 'window.requestFileSystem - Error retrieving TEMPORARY file system'));
                });
                it("file.spec.6 should error if you request a file system that is too large", function (done) {
                    if (isBrowser) {
                        /*window.requestFileSystem TEMPORARY and PERSISTENT filesystem quota is not limited in Chrome.
                        Firefox filesystem size is not limited but every 50MB request user permission.
                        IE10 allows up to 10mb of combined AppCache and IndexedDB used in implementation
                        of filesystem without prompting, once you hit that level you will be asked if you
                        want to allow it to be increased up to a max of 250mb per site.
                        So `size` parameter for `requestFileSystem` function does not affect on filesystem in Firefox and IE.*/
                        pending();
                    }

                    var fail = function (error) {
                        expect(error).toBeDefined();
                        expect(error).toBeFileError(FileError.QUOTA_EXCEEDED_ERR);
                        done();
                    };
                    //win = createWin('window.requestFileSystem');
                    // Request the file system
                    window.requestFileSystem(LocalFileSystem.TEMPORARY, 1000000000000000, failed.bind(null, done, 'window.requestFileSystem - Error retrieving TEMPORARY file system'), fail);
                });
                it("file.spec.7 should error out if you request a file system that does not exist", function (done) {

                    var fail = function (error) {
                        expect(error).toBeDefined();
                        if (isChrome) {
                            /*INVALID_MODIFICATION_ERR (code: 9) is thrown instead of SYNTAX_ERR(code: 8)
                            on requesting of a non-existant filesystem.*/
                            expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                        } else {
                            expect(error).toBeFileError(FileError.SYNTAX_ERR);
                        }
                        done();
                    };
                    // Request the file system
                    window.requestFileSystem(-1, 0, succeed.bind(null, done, 'window.requestFileSystem'), fail);
                });
            });
            describe('window.resolveLocalFileSystemURL', function () {
                it("file.spec.8 should be defined", function () {
                    expect(window.resolveLocalFileSystemURL).toBeDefined();
                });
                it("file.spec.9 should resolve a valid file name", function (done) {
                    var fileName = 'file.spec.9';
                    var win = function (fileEntry) {
                        expect(fileEntry).toBeDefined();
                        expect(fileEntry.isFile).toBe(true);
                        expect(fileEntry.isDirectory).toBe(false);
                        expect(fileEntry.name).toCanonicallyMatch(fileName);
                        expect(fileEntry.toURL()).not.toMatch(/^cdvfile:/, 'should not use cdvfile URL');
                        expect(fileEntry.toURL()).not.toMatch(/\/$/, 'URL should not end with a slash');
                        // Clean-up
                        deleteEntry(fileName, done);
                    };
                    createFile(fileName, function (entry) {
                        window.resolveLocalFileSystemURL(entry.toURL(), win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - Error resolving file URL: ' + entry.toURL()));
                    }, failed.bind(null, done, 'createFile - Error creating file: ' + fileName), failed.bind(null, done, 'createFile - Error creating file: ' + fileName));
                });
                it("file.spec.9.1 should resolve a file even with a terminating slash", function (done) {
                    var fileName = 'file.spec.9.1';
                    var win = function (fileEntry) {
                        expect(fileEntry).toBeDefined();
                        expect(fileEntry.isFile).toBe(true);
                        expect(fileEntry.isDirectory).toBe(false);
                        expect(fileEntry.name).toCanonicallyMatch(fileName);
                        expect(fileEntry.toURL()).not.toMatch(/^cdvfile:/, 'should not use cdvfile URL');
                        expect(fileEntry.toURL()).not.toMatch(/\/$/, 'URL should not end with a slash');
                        // Clean-up
                        deleteEntry(fileName, done);
                    };
                    createFile(fileName, function (entry) {
                        var entryURL = entry.toURL() + '/';
                        window.resolveLocalFileSystemURL(entryURL, win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - Error resolving file URL: ' + entryURL));
                    }, failed.bind(null, done, 'createFile - Error creating file: ' + fileName), failed.bind(null, done, 'createFile - Error creating file: ' + fileName));
                });
                it("file.spec.9.5 should resolve a directory", function (done) {
                    var fileName = 'file.spec.9.5';
                    var win = function (fileEntry) {
                        expect(fileEntry).toBeDefined();
                        expect(fileEntry.isFile).toBe(false);
                        expect(fileEntry.isDirectory).toBe(true);
                        expect(fileEntry.name).toCanonicallyMatch(fileName);
                        expect(fileEntry.toURL()).not.toMatch(/^cdvfile:/, 'should not use cdvfile URL');
                        expect(fileEntry.toURL()).toMatch(/\/$/, 'URL end with a slash');
                        // cleanup
                        deleteEntry(fileName, done);
                    };
                    function gotDirectory(entry) {
                        // lookup file system entry
                        window.resolveLocalFileSystemURL(entry.toURL(), win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - Error resolving directory URL: ' + entry.toURL()));
                    }
                    createDirectory(fileName, gotDirectory, failed.bind(null, done, 'createDirectory - Error creating directory: ' + fileName), failed.bind(null, done, 'createDirectory - Error creating directory: ' + fileName));
                });
                it("file.spec.9.6 should resolve a directory even without a terminating slash", function (done) {
                    var fileName = 'file.spec.9.6';
                    var win = function (fileEntry) {
                        expect(fileEntry).toBeDefined();
                        expect(fileEntry.isFile).toBe(false);
                        expect(fileEntry.isDirectory).toBe(true);
                        expect(fileEntry.name).toCanonicallyMatch(fileName);
                        expect(fileEntry.toURL()).not.toMatch(/^cdvfile:/, 'should not use cdvfile URL');
                        expect(fileEntry.toURL()).toMatch(/\/$/, 'URL end with a slash');
                        // cleanup
                        deleteEntry(fileName, done);
                    };
                    function gotDirectory(entry) {
                        // lookup file system entry
                        var entryURL = entry.toURL();
                        entryURL = entryURL.substring(0, entryURL.length - 1);
                        window.resolveLocalFileSystemURL(entryURL, win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - Error resolving directory URL: ' + entryURL));
                    }
                    createDirectory(fileName, gotDirectory, failed.bind(null, done, 'createDirectory - Error creating directory: ' + fileName), failed.bind(null, done, 'createDirectory - Error creating directory: ' + fileName));
                });

                it("file.spec.9.7 should resolve a file with valid nativeURL", function (done) {
                    var fileName = "de.create.file",
                    win = function (entry) {
                        var path = entry.nativeURL.split('///')[1];
                        expect(/\/{2,}/.test(path)).toBeFalsy();
                        // cleanup
                        deleteEntry(entry.name, done);
                    };
                    root.getFile(fileName, {
                        create: true
                    }, win, succeed.bind(null, done, 'root.getFile - Error unexpected callback, file should not exists: ' + fileName));
                });

                it("file.spec.10 resolve valid file name with parameters", function (done) {
                    var fileName = "resolve.file.uri.params",
                    win = function (fileEntry) {
                        expect(fileEntry).toBeDefined();
                        if (fileEntry.toURL().toLowerCase().substring(0, 10) === "cdvfile://") {
                            expect(fileEntry.fullPath).toBe("/" + fileName + "?1234567890");
                        }
                        expect(fileEntry.name).toBe(fileName);
                        // cleanup
                        deleteEntry(fileName, done);
                    };
                    // create a new file entry
                    createFile(fileName, function (entry) {
                        window.resolveLocalFileSystemURL(entry.toURL() + "?1234567890", win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - Error resolving file URI: ' + entry.toURL()));
                    }, failed.bind(null, done, 'createFile - Error creating file: ' + fileName));
                });
                it("file.spec.11 should error (NOT_FOUND_ERR) when resolving (non-existent) invalid file name", function (done) {
                    var fileName = cordova.platformId === 'windowsphone' ? root.toURL() + "/" + "this.is.not.a.valid.file.txt" : joinURL(root.toURL(), "this.is.not.a.valid.file.txt"),
                        fail = function (error) {
                        expect(error).toBeDefined();
                        expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                        done();
                    };
                    // lookup file system entry
                    window.resolveLocalFileSystemURL(fileName, succeed.bind(null, done, 'window.resolveLocalFileSystemURL - Error unexpected callback resolving file URI: ' + fileName), fail);
                });
                it("file.spec.12 should error (ENCODING_ERR) when resolving invalid URI with leading /", function (done) {
                    var fileName = "/this.is.not.a.valid.url",
                        fail = function (error) {
                        expect(error).toBeDefined();
                        expect(error).toBeFileError(FileError.ENCODING_ERR);
                        done();
                    };
                    // lookup file system entry
                    window.resolveLocalFileSystemURL(fileName, succeed.bind(null, done, 'window.resolveLocalFileSystemURL - Error unexpected callback resolving file URI: ' + fileName), fail);
                });
            });
        });
        //LocalFileSystem
        describe('Metadata interface', function () {
            it("file.spec.13 should exist and have the right properties", function () {
                var metadata = new Metadata();
                expect(metadata).toBeDefined();
                expect(metadata.modificationTime).toBeDefined();
            });
        });
        describe('Flags interface', function () {
            it("file.spec.14 should exist and have the right properties", function () {
                var flags = new Flags(false, true);
                expect(flags).toBeDefined();
                expect(flags.create).toBeDefined();
                expect(flags.create).toBe(false);
                expect(flags.exclusive).toBeDefined();
                expect(flags.exclusive).toBe(true);
            });
        });
        describe('FileSystem interface', function () {
            it("file.spec.15 should have a root that is a DirectoryEntry", function (done) {
                var win = function (entry) {
                    expect(entry).toBeDefined();
                    expect(entry.isFile).toBe(false);
                    expect(entry.isDirectory).toBe(true);
                    expect(entry.name).toBeDefined();
                    expect(entry.fullPath).toBeDefined();
                    expect(entry.getMetadata).toBeDefined();
                    expect(entry.moveTo).toBeDefined();
                    expect(entry.copyTo).toBeDefined();
                    expect(entry.toURL).toBeDefined();
                    expect(entry.remove).toBeDefined();
                    expect(entry.getParent).toBeDefined();
                    expect(entry.createReader).toBeDefined();
                    expect(entry.getFile).toBeDefined();
                    expect(entry.getDirectory).toBeDefined();
                    expect(entry.removeRecursively).toBeDefined();
                    done();
                };
                window.resolveLocalFileSystemURL(root.toURL(), win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - Error resolving file URI: ' + root.toURL()));
            });
        });
        describe('DirectoryEntry', function () {
            it("file.spec.16 getFile: get Entry for file that does not exist", function (done) {
                var fileName = "de.no.file",
                fail = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                    done();
                };
                // create:false, exclusive:false, file does not exist
                root.getFile(fileName, {
                    create : false
                }, succeed.bind(null, done, 'root.getFile - Error unexpected callback, file should not exists: ' + fileName), fail);
            });
            it("file.spec.17 getFile: create new file", function (done) {
                var fileName = "de.create.file",
                filePath = joinURL(root.fullPath, fileName),
                win = function (entry) {
                    expect(entry).toBeDefined();
                    expect(entry.isFile).toBe(true);
                    expect(entry.isDirectory).toBe(false);
                    expect(entry.name).toCanonicallyMatch(fileName);
                    expect(entry.fullPath).toCanonicallyMatch(filePath);
                    // cleanup
                    deleteEntry(entry.name, done);
                };
                // create:true, exclusive:false, file does not exist
                root.getFile(fileName, {
                    create : true
                }, win, succeed.bind(null, done, 'root.getFile - Error unexpected callback, file should not exists: ' + fileName));
            });
            it("file.spec.18 getFile: create new file (exclusive)", function (done) {
                var fileName = "de.create.exclusive.file",
                filePath = joinURL(root.fullPath, fileName),
                win = function (entry) {
                    expect(entry).toBeDefined();
                    expect(entry.isFile).toBe(true);
                    expect(entry.isDirectory).toBe(false);
                    expect(entry.name).toBe(fileName);
                    expect(entry.fullPath).toCanonicallyMatch(filePath);
                    // cleanup
                    deleteEntry(entry.name, done);
                };
                // create:true, exclusive:true, file does not exist
                root.getFile(fileName, {
                    create : true,
                    exclusive : true
                }, win, failed.bind(null, done, 'root.getFile - Error creating file: ' + fileName));
            });
            it("file.spec.19 getFile: create file that already exists", function (done) {
                var fileName = "de.create.existing.file",
                filePath = joinURL(root.fullPath, fileName);

                function win(entry) {
                    expect(entry).toBeDefined();
                    expect(entry.isFile).toBe(true);
                    expect(entry.isDirectory).toBe(false);
                    expect(entry.name).toCanonicallyMatch(fileName);
                    expect(entry.fullPath).toCanonicallyMatch(filePath);
                    // cleanup
                    deleteEntry(entry.name, done);
                }

                function getFile(file) {
                    // create:true, exclusive:false, file exists
                    root.getFile(fileName, {
                        create : true
                    }, win, failed.bind(null, done, 'root.getFile - Error creating file: ' + fileName));
                }

                // create file to kick off it
                root.getFile(fileName, {
                    create : true
                }, getFile, failed.bind(null, done, 'root.getFile - Error on initial creating file: ' + fileName));
            });
            it("file.spec.20 getFile: create file that already exists (exclusive)", function (done) {
                var fileName = "de.create.exclusive.existing.file",
                existingFile;

                function fail(error) {
                    expect(error).toBeDefined();
                    if (isChrome) {
                        /*INVALID_MODIFICATION_ERR (code: 9) is thrown instead of PATH_EXISTS_ERR(code: 12)
                        on trying to exclusively create a file, which already exists in Chrome.*/
                        expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                    } else {
                        expect(error).toBeFileError(FileError.PATH_EXISTS_ERR);
                    }
                    // cleanup
                    deleteEntry(existingFile.name, done);
                }

                function getFile(file) {
                    existingFile = file;
                    // create:true, exclusive:true, file exists
                    root.getFile(fileName, {
                        create : true,
                        exclusive : true
                    }, succeed.bind(null, done, 'root.getFile - getFile function - Error unexpected callback, file should exists: ' + fileName), fail);
                }

                // create file to kick off it
                root.getFile(fileName, {
                    create : true
                }, getFile, failed.bind(null, done, 'root.getFile - Error creating file: ' + fileName));
            });
            it("file.spec.21 DirectoryEntry.getFile: get Entry for existing file", function (done) {
                var fileName = "de.get.file",
                filePath = joinURL(root.fullPath, fileName),
                win = function (entry) {
                    expect(entry).toBeDefined();
                    expect(entry.isFile).toBe(true);
                    expect(entry.isDirectory).toBe(false);
                    expect(entry.name).toCanonicallyMatch(fileName);
                    expect(entry.fullPath).toCanonicallyMatch(filePath);
                    expect(entry.filesystem).toBeDefined();
                    expect(entry.filesystem).toBe(root.filesystem);
                    //clean up
                    deleteEntry(entry.name, done);
                },
                getFile = function (file) {
                    // create:false, exclusive:false, file exists
                    root.getFile(fileName, {
                        create : false
                    }, win, failed.bind(null, done, 'root.getFile - Error getting file entry: ' + fileName));
                };
                // create file to kick off it
                root.getFile(fileName, {
                    create : true
                }, getFile, failed.bind(null, done, 'root.getFile - Error creating file: ' + fileName));
            });
            it("file.spec.22 DirectoryEntry.getFile: get FileEntry for invalid path", function (done) {
                if (isBrowser) {
                    /*The plugin does not follow to ["8.3 Naming restrictions"]
                    (http://www.w3.org/TR/2011/WD-file-system-api-20110419/#naming-restrictions).*/
                    pending();
                }

                var fileName = "de:invalid:path",
                fail = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.ENCODING_ERR);
                    done();
                };
                // create:false, exclusive:false, invalid path
                root.getFile(fileName, {
                    create : false
                }, succeed.bind(null, done, 'root.getFile - Error unexpected callback, file should not exists: ' + fileName), fail);
            });
            it("file.spec.23 DirectoryEntry.getDirectory: get Entry for directory that does not exist", function (done) {
                var dirName = "de.no.dir",
                fail = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                    done();
                };
                // create:false, exclusive:false, directory does not exist
                root.getDirectory(dirName, {
                    create : false
                }, succeed.bind(null, done, 'root.getDirectory - Error unexpected callback, directory should not exists: ' + dirName), fail);
            });
            it("file.spec.24 DirectoryEntry.getDirectory: create new dir with space then resolveLocalFileSystemURL", function (done) {
                var dirName = "de create dir";

                function win(directory) {
                    expect(directory).toBeDefined();
                    expect(directory.isFile).toBe(false);
                    expect(directory.isDirectory).toBe(true);
                    expect(directory.name).toCanonicallyMatch(dirName);
                    expect(directory.fullPath).toCanonicallyMatch(joinURL(root.fullPath, dirName));
                    // cleanup
                    deleteEntry(directory.name, done);
                }

                function getDir(dirEntry) {
                    expect(dirEntry.filesystem).toBeDefined();
                    expect(dirEntry.filesystem).toBe(root.filesystem);
                    var dirURI = dirEntry.toURL();
                    // now encode URI and try to resolve
                    window.resolveLocalFileSystemURL(dirURI, win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - getDir function - Error resolving directory: ' + dirURI));
                }

                // create:true, exclusive:false, directory does not exist
                root.getDirectory(dirName, {
                    create : true
                }, getDir, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            // This test is excluded, and should probably be removed. Filesystem
            // should always be properly encoded URLs, and *not* raw paths, and it
            // doesn't make sense to double-encode the URLs and expect that to be
            // handled by the implementation.
            // If a particular platform uses paths internally rather than URLs, // then that platform should careful to pass them correctly to its
            // backend.
            xit("file.spec.25 DirectoryEntry.getDirectory: create new dir with space resolveLocalFileSystemURL with encoded URI", function (done) {
                var dirName = "de create dir2",
                dirPath = joinURL(root.fullPath, dirName);

                function win(directory) {
                    expect(directory).toBeDefined();
                    expect(directory.isFile).toBe(false);
                    expect(directory.isDirectory).toBe(true);
                    expect(directory.name).toCanonicallyMatch(dirName);
                    expect(directory.fullPath).toCanonicallyMatch(dirPath);
                    // cleanup
                    deleteEntry(directory.name, done);
                }

                function getDir(dirEntry) {
                    var dirURI = dirEntry.toURL();
                    // now encode URI and try to resolve
                    window.resolveLocalFileSystemURL(encodeURI(dirURI), win, failed.bind(null, done, 'window.resolveLocalFileSystemURL - getDir function - Error resolving directory: ' + dirURI));
                }

                // create:true, exclusive:false, directory does not exist
                root.getDirectory(dirName, {
                    create : true
                }, getDir, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.26 DirectoryEntry.getDirectory: create new directory", function (done) {
                var dirName = "de.create.dir",
                dirPath = joinURL(root.fullPath, dirName),
                win = function (directory) {
                    expect(directory).toBeDefined();
                    expect(directory.isFile).toBe(false);
                    expect(directory.isDirectory).toBe(true);
                    expect(directory.name).toCanonicallyMatch(dirName);
                    expect(directory.fullPath).toCanonicallyMatch(dirPath);
                    expect(directory.filesystem).toBeDefined();
                    expect(directory.filesystem).toBe(root.filesystem);
                    // cleanup
                    deleteEntry(directory.name, done);
                };
                // create:true, exclusive:false, directory does not exist
                root.getDirectory(dirName, {
                    create : true
                }, win, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.27 DirectoryEntry.getDirectory: create new directory (exclusive)", function (done) {
                var dirName = "de.create.exclusive.dir",
                dirPath = joinURL(root.fullPath, dirName),
                win = function (directory) {
                    expect(directory).toBeDefined();
                    expect(directory.isFile).toBe(false);
                    expect(directory.isDirectory).toBe(true);
                    expect(directory.name).toCanonicallyMatch(dirName);
                    expect(directory.fullPath).toCanonicallyMatch(dirPath);
                    expect(directory.filesystem).toBeDefined();
                    expect(directory.filesystem).toBe(root.filesystem);
                    // cleanup
                    deleteEntry(directory.name, done);
                };
                // create:true, exclusive:true, directory does not exist
                root.getDirectory(dirName, {
                    create : true,
                    exclusive : true
                }, win, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.28 DirectoryEntry.getDirectory: create directory that already exists", function (done) {
                var dirName = "de.create.existing.dir",
                dirPath = joinURL(root.fullPath, dirName),
                win = function (directory) {
                    expect(directory).toBeDefined();
                    expect(directory.isFile).toBe(false);
                    expect(directory.isDirectory).toBe(true);
                    expect(directory.name).toCanonicallyMatch(dirName);
                    expect(directory.fullPath).toCanonicallyMatch(dirPath);
                    // cleanup
                    deleteEntry(directory.name, done);
                };
                // create directory to kick off it
                root.getDirectory(dirName, {
                    create : true
                }, function () {
                    root.getDirectory(dirName, {
                        create : true
                    }, win, failed.bind(null, done, 'root.getDirectory - Error creating existent second directory : ' + dirName));
                }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.29 DirectoryEntry.getDirectory: create directory that already exists (exclusive)", function (done) {

                var dirName = "de.create.exclusive.existing.dir",
                existingDir,
                fail = function (error) {
                    expect(error).toBeDefined();
                    if (isChrome) {
                        /*INVALID_MODIFICATION_ERR (code: 9) is thrown instead of PATH_EXISTS_ERR(code: 12)
                        on trying to exclusively create a file or directory, which already exists (Chrome).*/
                        expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                    } else {
                        expect(error).toBeFileError(FileError.PATH_EXISTS_ERR);
                    }
                    // cleanup
                    deleteEntry(existingDir.name, done);
                };
                // create directory to kick off it
                root.getDirectory(dirName, {
                    create : true
                }, function (directory) {
                    existingDir = directory;
                    // create:true, exclusive:true, directory exists
                    root.getDirectory(dirName, {
                        create : true,
                        exclusive : true
                    }, failed.bind(null, done, 'root.getDirectory - Unexpected success callback, second directory should not be created : ' + dirName), fail);
                }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.30 DirectoryEntry.getDirectory: get Entry for existing directory", function (done) {
                var dirName = "de.get.dir",
                dirPath = joinURL(root.fullPath, dirName),
                win = function (directory) {
                    expect(directory).toBeDefined();
                    expect(directory.isFile).toBe(false);
                    expect(directory.isDirectory).toBe(true);
                    expect(directory.name).toCanonicallyMatch(dirName);
                    expect(directory.fullPath).toCanonicallyMatch(dirPath);
                    // cleanup
                    deleteEntry(directory.name, done);
                };
                // create directory to kick it off
                root.getDirectory(dirName, {
                    create : true
                }, function () {
                    root.getDirectory(dirName, {
                        create : false
                    }, win, failed.bind(null, done, 'root.getDirectory - Error getting directory entry : ' + dirName));
                }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.31 DirectoryEntry.getDirectory: get DirectoryEntry for invalid path", function (done) {
                if (isBrowser) {
                    /*The plugin does not follow to ["8.3 Naming restrictions"]
                    (http://www.w3.org/TR/2011/WD-file-system-api-20110419/#naming-restrictions).*/
                    pending();
                }

                var dirName = "de:invalid:path",
                fail = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.ENCODING_ERR);
                    done();
                };
                // create:false, exclusive:false, invalid path
                root.getDirectory(dirName, {
                    create : false
                }, succeed.bind(null, done, 'root.getDirectory - Unexpected success callback, directory should not exists: ' + dirName), fail);
            });
            it("file.spec.32 DirectoryEntry.getDirectory: get DirectoryEntry for existing file", function (done) {
                var fileName = "de.existing.file",
                existingFile,
                fail = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.TYPE_MISMATCH_ERR);
                    // cleanup
                    deleteEntry(existingFile.name, done);
                };
                // create file to kick off it
                root.getFile(fileName, {
                    create : true
                }, function (file) {
                    existingFile = file;
                    root.getDirectory(fileName, {
                        create : false
                    }, succeed.bind(null, done, 'root.getDirectory - Unexpected success callback, directory should not exists: ' + fileName), fail);
                }, failed.bind(null, done, 'root.getFile - Error creating file : ' + fileName));
            });
            it("file.spec.33 DirectoryEntry.getFile: get FileEntry for existing directory", function (done) {
                var dirName = "de.existing.dir",
                existingDir,
                fail = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.TYPE_MISMATCH_ERR);
                    // cleanup
                    deleteEntry(existingDir.name, done);
                };
                // create directory to kick off it
                root.getDirectory(dirName, {
                    create : true
                }, function (directory) {
                    existingDir = directory;
                    root.getFile(dirName, {
                        create : false
                    }, succeed.bind(null, done, 'root.getFile - Unexpected success callback, file should not exists: ' + dirName), fail);
                }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.34 DirectoryEntry.removeRecursively on directory", function (done) {
                var dirName = "de.removeRecursively",
                subDirName = "dir",
                dirExists = function (error) {
                    expect(error).toBeDefined();
                    expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                    done();
                };
                // create a new directory entry to kick off it
                root.getDirectory(dirName, {
                    create : true
                }, function (entry) {
                    entry.getDirectory(subDirName, {
                        create : true
                    }, function (dir) {
                        entry.removeRecursively(function () {
                            root.getDirectory(dirName, {
                                create : false
                            }, succeed.bind(null, done, 'root.getDirectory - Unexpected success callback, directory should not exists: ' + dirName), dirExists);
                        }, failed.bind(null, done, 'entry.removeRecursively - Error removing directory recursively : ' + dirName));
                    }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + subDirName));
                }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.35 createReader: create reader on existing directory", function () {
                // create reader for root directory
                var reader = root.createReader();
                expect(reader).toBeDefined();
                expect(typeof reader.readEntries).toBe('function');
            });
            it("file.spec.36 removeRecursively on root file system", function (done) {

                var remove = function (error) {
                    expect(error).toBeDefined();
                    if (isChrome) {
                        /*INVALID_MODIFICATION_ERR (code: 9) is thrown instead of
                        NO_MODIFICATION_ALLOWED_ERR(code: 6) on trying to call removeRecursively
                        on the root file system (Chrome).*/
                        expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                    } else {
                        expect(error).toBeFileError(FileError.NO_MODIFICATION_ALLOWED_ERR);
                    }
                    done();
                };
                // remove root file system
                root.removeRecursively(succeed.bind(null, done, 'root.removeRecursively - Unexpected success callback, root cannot be removed'), remove);
            });
        });
        describe('DirectoryReader interface', function () {
            describe("readEntries", function () {
                it("file.spec.37 should read contents of existing directory", function (done) {
                    var reader,
                    win = function (entries) {
                        expect(entries).toBeDefined();
                        expect(entries instanceof Array).toBe(true);
                        done();
                    };
                    // create reader for root directory
                    reader = root.createReader();
                    // read entries
                    reader.readEntries(win, failed.bind(null, done, 'reader.readEntries - Error reading entries'));
                });
                it("file.spec.37.1 should read contents of existing directory", function (done) {
                    var dirName = 'readEntries.dir',
                    fileName = 'readeEntries.file';
                    root.getDirectory(dirName, {
                        create : true
                    }, function (directory) {
                        directory.getFile(fileName, {
                            create : true
                        }, function (fileEntry) {
                            var reader = directory.createReader();
                            reader.readEntries(function (entries) {
                                expect(entries).toBeDefined();
                                expect(entries instanceof Array).toBe(true);
                                expect(entries.length).toBe(1);
                                expect(entries[0].fullPath).toCanonicallyMatch(fileEntry.fullPath);
                                expect(entries[0].filesystem).not.toBe(null);
                                if (isChrome) {
                                    // Slicing '[object {type}]' -> '{type}'
                                    expect(entries[0].filesystem.toString().slice(8, -1)).toEqual("DOMFileSystem");
                                }
                                else {
                                    expect(entries[0].filesystem instanceof FileSystem).toBe(true);
                                }

                                // cleanup
                                deleteEntry(directory.name, done);
                            }, failed.bind(null, done, 'reader.readEntries - Error reading entries from directory: ' + dirName));
                        }, failed.bind(null, done, 'directory.getFile - Error creating file : ' + fileName));
                    }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
                });
                it("file.spec.109 should return an empty entry list on the second call", function (done) {
                    var reader,
                    fileName = 'test109.txt';
                    // Add a file to ensure the root directory is non-empty and then read the contents of the directory.
                    root.getFile(fileName, {
                        create : true
                    }, function (entry) {
                        reader = root.createReader();
                        //First read
                        reader.readEntries(function (entries) {
                            expect(entries).toBeDefined();
                            expect(entries instanceof Array).toBe(true);
                            expect(entries.length).not.toBe(0);
                            //Second read
                            reader.readEntries(function (entries_) {
                                expect(entries_).toBeDefined();
                                expect(entries_ instanceof Array).toBe(true);
                                expect(entries_.length).toBe(0);
                                //Clean up
                                deleteEntry(entry.name, done);
                            }, failed.bind(null, done, 'reader.readEntries - Error during SECOND reading of entries from [root] directory'));
                        }, failed.bind(null, done, 'reader.readEntries - Error during FIRST reading of entries from [root] directory'));
                    }, failed.bind(null, done, 'root.getFile - Error creating file : ' + fileName));
                });
            });
            it("file.spec.38 should read contents of directory that has been removed", function (done) {
                var dirName = "de.createReader.notfound";
                // create a new directory entry to kick off it
                root.getDirectory(dirName, {
                    create : true
                }, function (directory) {
                    directory.removeRecursively(function () {
                        var reader = directory.createReader();
                        reader.readEntries(succeed.bind(null, done, 'reader.readEntries - Unexpected success callback, it should not read entries from deleted dir: ' + dirName), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                            root.getDirectory(dirName, {
                                create : false
                            }, succeed.bind(null, done, 'root.getDirectory - Unexpected success callback, it should not get deleted directory: ' + dirName), function (err) {
                                expect(err).toBeDefined();
                                expect(err).toBeFileError(FileError.NOT_FOUND_ERR);
                                done();
                            });
                        });
                    }, failed.bind(null, done, 'directory.removeRecursively - Error removing directory recursively : ' + dirName));
                }, failed.bind(null, done, 'root.getDirectory - Error creating directory : ' + dirName));
            });
        });
        //DirectoryReader interface
        describe('File', function () {
            it("file.spec.39 constructor should be defined", function () {
                expect(File).toBeDefined();
                expect(typeof File).toBe('function');
            });
            it("file.spec.40 should be define File attributes", function () {
                var file = new File();
                expect(file.name).toBeDefined();
                expect(file.type).toBeDefined();
                expect(file.lastModifiedDate).toBeDefined();
                expect(file.size).toBeDefined();
            });
        });
        //File
        describe('FileEntry', function () {

            it("file.spec.41 should be define FileEntry methods", function (done) {
                var fileName = "fe.methods",
                testFileEntry = function (fileEntry) {
                    expect(fileEntry).toBeDefined();
                    expect(typeof fileEntry.createWriter).toBe('function');
                    expect(typeof fileEntry.file).toBe('function');
                    // cleanup
                    deleteEntry(fileEntry.name, done);
                };
                // create a new file entry to kick off it
                root.getFile(fileName, {
                    create : true
                }, testFileEntry, failed.bind(null, done, 'root.getFile - Error creating file : ' + fileName));
            });
            it("file.spec.42 createWriter should return a FileWriter object", function (done) {
                var fileName = "fe.createWriter",
                testFile,
                testWriter = function (writer) {
                    expect(writer).toBeDefined();
                    if (isChrome) {
                        // Slicing '[object {type}]' -> '{type}'
                        expect(writer.toString().slice(8, -1)).toEqual("FileWriter");
                    }
                    else {
                        expect(writer instanceof FileWriter).toBe(true);
                    }

                    // cleanup
                    deleteEntry(testFile.name, done);
                };
                // create a new file entry to kick off it
                root.getFile(fileName, {
                    create : true
                }, function (fileEntry) {
                    testFile = fileEntry;
                    fileEntry.createWriter(testWriter, failed.bind(null, done, 'fileEntry.createWriter - Error creating Writer from entry'));
                }, failed.bind(null, done, 'root.getFile - Error creating file : ' + fileName));
            });
            it("file.spec.43 file should return a File object", function (done) {
                var fileName = "fe.file",
                newFile,
                testFile = function (file) {
                    expect(file).toBeDefined();
                    if (isChrome) {
                        // Slicing '[object {type}]' -> '{type}'
                        expect(file.toString().slice(8, -1)).toEqual("File");
                    }
                    else {
                        expect(file instanceof File).toBe(true);
                    }

                    // cleanup
                    deleteEntry(newFile.name, done);
                };
                // create a new file entry to kick off it
                root.getFile(fileName, {
                    create : true
                }, function (fileEntry) {
                    newFile = fileEntry;
                    fileEntry.file(testFile, failed.bind(null, done, 'fileEntry.file - Error reading file using fileEntry: ' + fileEntry.name));
                }, failed.bind(null, done, 'root.getFile - Error creating file : ' + fileName));
            });
            it("file.spec.44 file: on File that has been removed", function (done) {
                var fileName = "fe.no.file";
                // create a new file entry to kick off it
                root.getFile(fileName, {
                    create : true
                }, function (fileEntry) {
                    fileEntry.remove(function () {
                        fileEntry.file(succeed.bind(null, done, 'fileEntry.file - Unexpected success callback, file it should not be created from removed entry'), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                            done();
                        });
                    }, failed.bind(null, done, 'fileEntry.remove - Error removing entry : ' + fileName));
                }, failed.bind(null, done, 'root.getFile - Error creating file : ' + fileName));
            });
        });
        //FileEntry
        describe('Entry', function () {
            it("file.spec.45 Entry object", function (done) {
                var fileName = "entry",
                fullPath = joinURL(root.fullPath, fileName),
                winEntry = function (entry) {
                    expect(entry).toBeDefined();
                    expect(entry.isFile).toBe(true);
                    expect(entry.isDirectory).toBe(false);
                    expect(entry.name).toCanonicallyMatch(fileName);
                    expect(entry.fullPath).toCanonicallyMatch(fullPath);
                    expect(typeof entry.getMetadata).toBe('function');
                    expect(typeof entry.setMetadata).toBe('function');
                    expect(typeof entry.moveTo).toBe('function');
                    expect(typeof entry.copyTo).toBe('function');
                    expect(typeof entry.toURL).toBe('function');
                    expect(typeof entry.remove).toBe('function');
                    expect(typeof entry.getParent).toBe('function');
                    expect(typeof entry.createWriter).toBe('function');
                    expect(typeof entry.file).toBe('function');
                    // Clean up
                    deleteEntry(fileName, done);
                };
                // create a new file entry
                createFile(fileName, winEntry, failed.bind(null, done, 'createFile - Error creating file : ' + fileName));
            });
            it("file.spec.46 Entry.getMetadata on file", function (done) {
                var fileName = "entry.metadata.file";
                // create a new file entry
                createFile(fileName, function (entry) {
                    entry.getMetadata(function (metadata) {
                        expect(metadata).toBeDefined();
                        expect(metadata.modificationTime instanceof Date).toBe(true);
                        expect(typeof metadata.size).toBe("number");
                        // cleanup
                        deleteEntry(fileName, done);
                    }, failed.bind(null, done, 'entry.getMetadata - Error getting metadata from entry : ' + fileName));
                }, failed.bind(null, done, 'createFile - Error creating file : ' + fileName));
            });
            it("file.spec.47 Entry.getMetadata on directory", function (done) {
                if (isIndexedDBShim) {
                    /* Does not support metadata for directories (Firefox, IE) */
                    pending();
                }

                var dirName = "entry.metadata.dir";
                // create a new directory entry
                createDirectory(dirName, function (entry) {
                    entry.getMetadata(function (metadata) {
                        expect(metadata).toBeDefined();
                        expect(metadata.modificationTime instanceof Date).toBe(true);
                        expect(typeof metadata.size).toBe("number");
                        expect(metadata.size).toBe(0);
                        // cleanup
                        deleteEntry(dirName, done);
                    }, failed.bind(null, done, 'entry.getMetadata - Error getting metadata from entry : ' + dirName));
                }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.48 Entry.getParent on file in root file system", function (done) {
                var fileName = "entry.parent.file",
                rootPath = root.fullPath;
                // create a new file entry
                createFile(fileName, function (entry) {
                    entry.getParent(function (parent) {
                        expect(parent).toBeDefined();
                        expect(parent.fullPath).toCanonicallyMatch(rootPath);
                        // cleanup
                        deleteEntry(fileName, done);
                    }, failed.bind(null, done, 'entry.getParent - Error getting parent directory of file : ' + fileName));
                }, failed.bind(null, done, 'createFile - Error creating file : ' + fileName));
            });
            it("file.spec.49 Entry.getParent on directory in root file system", function (done) {
                var dirName = "entry.parent.dir",
                rootPath = root.fullPath;
                // create a new directory entry
                createDirectory(dirName, function (entry) {
                    entry.getParent(function (parent) {
                        expect(parent).toBeDefined();
                        expect(parent.fullPath).toCanonicallyMatch(rootPath);
                        // cleanup
                        deleteEntry(dirName, done);
                    }, failed.bind(null, done, 'entry.getParent - Error getting parent directory of directory : ' + dirName));
                }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.50 Entry.getParent on root file system", function (done) {
                var rootPath = root.fullPath,
                winParent = function (parent) {
                    expect(parent).toBeDefined();
                    expect(parent.fullPath).toCanonicallyMatch(rootPath);
                    done();
                };
                // create a new directory entry
                root.getParent(winParent, failed.bind(null, done, 'root.getParent - Error getting parent directory of root'));
            });
            it("file.spec.51 Entry.toURL on file", function (done) {
                var fileName = "entry.uri.file",
                rootPath = root.fullPath,
                winURI = function (entry) {
                    var uri = entry.toURL();
                    expect(uri).toBeDefined();
                    expect(uri.indexOf(rootPath)).not.toBe(-1);
                    // cleanup
                    deleteEntry(fileName, done);
                };
                // create a new file entry
                createFile(fileName, winURI, failed.bind(null, done, 'createFile - Error creating file : ' + fileName));
            });
            it("file.spec.52 Entry.toURL on directory", function (done) {
                var dirName_1 = "num 1",
                dirName_2 = "num 2",
                rootPath = root.fullPath;
                createDirectory(dirName_1, function (entry) {
                    entry.getDirectory(dirName_2, {
                        create : true
                    }, function (entryFile) {
                        var uri = entryFile.toURL();
                        expect(uri).toBeDefined();
                        expect(uri).toContain('/num%201/num%202/');
                        expect(uri.indexOf(rootPath)).not.toBe(-1);
                        // cleanup
                        deleteEntry(dirName_1, done);
                    }, failed.bind(null, done, 'entry.getDirectory - Error creating directory : ' + dirName_2));
                }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + dirName_1));
            });
            it("file.spec.53 Entry.remove on file", function (done) {
                var fileName = "entr .rm.file";
                // create a new file entry
                createFile(fileName, function (entry) {
                    expect(entry).toBeDefined();
                    entry.remove(function () {
                        root.getFile(fileName, null, succeed.bind(null, done, 'root.getFile - Unexpected success callback, it should not get deleted file : ' + fileName), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                            // cleanup
                            deleteEntry(fileName, done);
                        });
                    }, failed.bind(null, done, 'entry.remove - Error removing entry : ' + fileName));
                }, failed.bind(null, done, 'createFile - Error creating file : ' + fileName));
            });
            it("file.spec.53.1 Entry.remove on filename with #s", function (done) {
                var fileName = "entry.#rm#.file";
                // create a new file entry
                createFile(fileName, function (entry) {
                    expect(entry).toBeDefined();
                    entry.remove(function () {
                        root.getFile(fileName, null, succeed.bind(null, done, 'root.getFile - Unexpected success callback, it should not get deleted file : ' + fileName), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                            // cleanup
                            deleteEntry(fileName, done);
                        });
                    }, failed.bind(null, done, 'entry.remove - Error removing entry : ' + fileName));
                }, failed.bind(null, done, 'createFile - Error creating file : ' + fileName));
            });
            it("file.spec.54 remove on empty directory", function (done) {
                var dirName = "entry.rm.dir";
                // create a new directory entry
                createDirectory(dirName, function (entry) {
                    expect(entry).toBeDefined();
                    entry.remove(function () {
                        root.getDirectory(dirName, null, succeed.bind(null, done, 'root.getDirectory - Unexpected success callback, it should not get deleted directory : ' + dirName), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.NOT_FOUND_ERR);
                            // cleanup
                            deleteEntry(dirName, done);
                        });
                    }, failed.bind(null, done, 'entry.remove - Error removing entry : ' + dirName));
                }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.55 remove on non-empty directory", function (done) {
                if (isIndexedDBShim) {
                    /* Both Entry.remove and directoryEntry.removeRecursively don't fail when removing
                    non-empty directories - directories being removed are cleaned
                    along with contents instead (Firefox, IE)*/
                    pending();
                }

                var dirName = "ent y.rm.dir.not.empty",
                fileName = "re ove.txt",
                fullPath = joinURL(root.fullPath, dirName);
                // create a new directory entry
                createDirectory(dirName, function (entry) {
                    entry.getFile(fileName, {
                        create : true
                    }, function (fileEntry) {
                        entry.remove(succeed.bind(null, done, 'entry.remove - Unexpected success callback, it should not remove a directory that contains files : ' + dirName), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                            root.getDirectory(dirName, null, function (entry) {
                                expect(entry).toBeDefined();
                                expect(entry.fullPath).toCanonicallyMatch(fullPath);
                                // cleanup
                                deleteEntry(dirName, done);
                            }, failed.bind(null, done, 'root.getDirectory - Error getting directory : ' + dirName));
                        });
                    }, failed.bind(null, done, 'entry.getFile - Error creating file : ' + fileName + ' inside of ' + dirName));
                }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + dirName));
            });
            it("file.spec.56 remove on root file system", function (done) {

                // remove entry that doesn't exist
                root.remove(succeed.bind(null, done, 'entry.remove - Unexpected success callback, it should not remove entry that it does not exists'), function (error) {
                    expect(error).toBeDefined();
                    if (isChrome) {
                        /*INVALID_MODIFICATION_ERR (code: 9) is thrown instead of
                        NO_MODIFICATION_ALLOWED_ERR(code: 6) on trying to call removeRecursively
                        on the root file system.*/
                        expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                    } else {
                        expect(error).toBeFileError(FileError.NO_MODIFICATION_ALLOWED_ERR);
                    }
                    done();
                });
            });
            it("file.spec.57 copyTo: file", function (done) {
                var file1 = "entry copy.file1",
                file2 = "entry copy.file2",
                fullPath = joinURL(root.fullPath, file2);
                // create a new file entry to kick off it
                deleteEntry(file2, function () {
                    createFile(file1, function (fileEntry) {
                        // copy file1 to file2
                        fileEntry.copyTo(root, file2, function (entry) {
                            expect(entry).toBeDefined();
                            expect(entry.isFile).toBe(true);
                            expect(entry.isDirectory).toBe(false);
                            expect(entry.fullPath).toCanonicallyMatch(fullPath);
                            expect(entry.name).toCanonicallyMatch(file2);
                            root.getFile(file2, {
                                create : false
                            }, function (entry2) {
                                expect(entry2).toBeDefined();
                                expect(entry2.isFile).toBe(true);
                                expect(entry2.isDirectory).toBe(false);
                                expect(entry2.fullPath).toCanonicallyMatch(fullPath);
                                expect(entry2.name).toCanonicallyMatch(file2);
                                // cleanup
                                deleteEntry(file1, function () {
                                    deleteEntry(file2, done);
                                });
                            }, failed.bind(null, done, 'root.getFile - Error getting copied file : ' + file2));
                        }, failed.bind(null, done, 'fileEntry.copyTo - Error copying file : ' + file2));
                    }, failed.bind(null, done, 'createFile - Error creating file : ' + file1));
                }, failed.bind(null, done, 'deleteEntry - Error removing file : ' + file2));
            });
            it("file.spec.58 copyTo: file onto itself", function (done) {
                var file1 = "entry.copy.fos.file1";
                // create a new file entry to kick off it
                createFile(file1, function (entry) {
                    // copy file1 onto itself
                    entry.copyTo(root, null, succeed.bind(null, done, 'entry.copyTo - Unexpected success callback, it should not copy a null file'), function (error) {
                        expect(error).toBeDefined();
                        expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);
                        // cleanup
                        deleteEntry(file1, done);
                    });
                }, failed.bind(null, done, 'createFile - Error creating file : ' + file1));
            });
            it("file.spec.59 copyTo: directory", function (done) {
                if (isIndexedDBShim) {
                    /* `copyTo` and `moveTo` functions do not support directories (Firefox, IE) */
                    pending();
                }

                var file1 = "file1",
                srcDir = "entry.copy.srcDir",
                dstDir = "entry.copy.dstDir",
                dstPath = joinURL(root.fullPath, dstDir),
                filePath = joinURL(dstPath, file1);
                // create a new directory entry to kick off it
                deleteEntry(dstDir, function () {
                    createDirectory(srcDir, function (directory) {
                        // create a file within new directory
                        directory.getFile(file1, {
                            create : true
                        }, function () {
                            directory.copyTo(root, dstDir, function (directory) {
                                expect(directory).toBeDefined();
                                expect(directory.isFile).toBe(false);
                                expect(directory.isDirectory).toBe(true);
                                expect(directory.fullPath).toCanonicallyMatch(dstPath);
                                expect(directory.name).toCanonicallyMatch(dstDir);
                                root.getDirectory(dstDir, {
                                    create : false
                                }, function (dirEntry) {
                                    expect(dirEntry).toBeDefined();
                                    expect(dirEntry.isFile).toBe(false);
                                    expect(dirEntry.isDirectory).toBe(true);
                                    expect(dirEntry.fullPath).toCanonicallyMatch(dstPath);
                                    expect(dirEntry.name).toCanonicallyMatch(dstDir);
                                    dirEntry.getFile(file1, {
                                        create : false
                                    }, function (fileEntry) {
                                        expect(fileEntry).toBeDefined();
                                        expect(fileEntry.isFile).toBe(true);
                                        expect(fileEntry.isDirectory).toBe(false);
                                        expect(fileEntry.fullPath).toCanonicallyMatch(filePath);
                                        expect(fileEntry.name).toCanonicallyMatch(file1);
                                        // cleanup
                                        deleteEntry(srcDir, function () {
                                            deleteEntry(dstDir, done);
                                        });
                                    }, failed.bind(null, done, 'dirEntry.getFile - Error getting file : ' + file1));
                                }, failed.bind(null, done, 'root.getDirectory - Error getting copied directory : ' + dstDir));
                            }, failed.bind(null, done, 'directory.copyTo - Error copying directory : ' + srcDir + ' to :' + dstDir));
                        }, failed.bind(null, done, 'directory.getFile - Error creating file : ' + file1));
                    }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + srcDir));
                }, failed.bind(null, done, 'deleteEntry - Error removing directory : ' + dstDir));
            });
            it("file.spec.60 copyTo: directory to backup at same root directory", function (done) {
                if (isIndexedDBShim) {
                    /* `copyTo` and `moveTo` functions do not support directories (Firefox, IE) */
                    pending();
                }

                var file1 = "file1",
                srcDir = "entry.copy srcDirSame",
                dstDir = "entry.copy srcDirSame-backup",
                dstPath = joinURL(root.fullPath, dstDir),
                filePath = joinURL(dstPath, file1);
                // create a new directory entry to kick off it
                deleteEntry(dstDir, function () {
                    createDirectory(srcDir, function (directory) {
                        directory.getFile(file1, {
                            create : true
                        }, function () {
                            directory.copyTo(root, dstDir, function (directory) {
                                expect(directory).toBeDefined();
                                expect(directory.isFile).toBe(false);
                                expect(directory.isDirectory).toBe(true);
                                expect(directory.fullPath).toCanonicallyMatch(dstPath);
                                expect(directory.name).toCanonicallyMatch(dstDir);
                                root.getDirectory(dstDir, {
                                    create : false
                                }, function (dirEntry) {
                                    expect(dirEntry).toBeDefined();
                                    expect(dirEntry.isFile).toBe(false);
                                    expect(dirEntry.isDirectory).toBe(true);
                                    expect(dirEntry.fullPath).toCanonicallyMatch(dstPath);
                                    expect(dirEntry.name).toCanonicallyMatch(dstDir);
                                    dirEntry.getFile(file1, {
                                        create : false
                                    }, function (fileEntry) {
                                        expect(fileEntry).toBeDefined();
                                        expect(fileEntry.isFile).toBe(true);
                                        expect(fileEntry.isDirectory).toBe(false);
                                        expect(fileEntry.fullPath).toCanonicallyMatch(filePath);
                                        expect(fileEntry.name).toCanonicallyMatch(file1);
                                        // cleanup
                                        deleteEntry(srcDir, function () {
                                            deleteEntry(dstDir, done);
                                        });
                                    }, failed.bind(null, done, 'dirEntry.getFile - Error getting file : ' + file1));
                                }, failed.bind(null, done, 'root.getDirectory - Error getting copied directory : ' + dstDir));
                            }, failed.bind(null, done, 'directory.copyTo - Error copying directory : ' + srcDir + ' to :' + dstDir));
                        }, failed.bind(null, done, 'directory.getFile - Error creating file : ' + file1));
                    }, failed.bind(null, done, 'createDirectory - Error creating directory : ' + srcDir));
                }, failed.bind(null, done, 'deleteEntry - Error removing directory : ' + dstDir));
            });
            it("file.spec.61 copyTo: directory onto itself", function (done) {
                if (isIndexedDBShim) {
                    /* `copyTo` and `moveTo` functions do not support directories (Firefox, IE) */
                    pending();
                }

                var file1 = "file1",
                srcDir = "entry.copy.dos.srcDir",
                srcPath = joinURL(root.fullPath, srcDir),
                filePath = joinURL(srcPath, file1);
                // create a new directory entry to kick off it
                createDirectory(srcDir, function (directory) {
                    // create a file within new directory
                    directory.getFile(file1, {
                        create : true
                    }, function (fileEntry) {
                        // copy srcDir onto itself
                        directory.copyTo(root, null, succeed.bind(null, done, 'directory.copyTo - Unexpected success callback, it should not copy file: ' + srcDir + ' to a null destination'), function (error) {
                            expect(error).toBeDefined();
                            expect(error).toBeFileError(FileError.INVALID_MODIFICATION_ERR);