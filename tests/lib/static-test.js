/*
 * Copyright (c) 2013, Yahoo! Inc. All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE.txt file for terms.
 */

/*jslint nomen:true, node:true*/
/*global describe, it, before, beforeEach, afterEach*/

'use strict';

var assert = require('chai').assert,
    libpath = require('path'),
    libstatic,
    mockery = require('mockery'),
    fixturesPath = libpath.join(__dirname, '../fixtures');

describe('static', function () {

    // flag to track express.static
    var middlewareWasCalled,
        staticMock, // express.static
        sendMock; // SendStream

    function registerMockery() {

        staticMock = function (rootPath, options) {
            return function (req, res, next) {
                middlewareWasCalled = true;
                next();
            };
        };

        /**
        The `options` parameter contains specific properties for the mock. See
        description below.

        The constructor also set the following properties on init:
        - {Boolean} `maxageWasCalled` 
        - {Boolean} `pipeWasCalled` 


        @constructor SendStream
        @param {http.ServerResponse} res
        @param {Object} options
          @param {Boolean} options.mockError
          @param {Boolean} options.mockOnError
          @param {Boolean} options.mockOnStatError
          @param {Function} options.mockNext
        **/
        sendMock = function (res, options) {
            this.res = res;
            this.options = options;

            this.maxageWasCalled = false;
            this.pipeWasCalled = false;
        };
        sendMock.prototype = {
            maxage: function (age) {
                this.maxageWasCalled = true;
                // default value is 0,
                // if not default, then test for a specific value, which we
                // have chosen to be `200`
                if (age !== 0) {
                    assert.strictEqual(200, age, 'age should be 200');
                }
            },
            error: function (code, message) {
                if (this.options.mockError &&
                        this.options.mockError === true) {

                    var error = new Error();
                    error.code = code;
                    error.message = message;
                    this.options.mockNext(error);
                }
            },
            on: function (event, cb) {
                if (event === "error") {
                    if (this.options.mockOnError &&
                            this.options.mockOnError === true) {
                        // console.log('---- mockOnError ----');
                        cb("Error streaming data");
                    }
                }
            },
            onStatError: function (err) {
                if (this.options.mockOnStatError &&
                        this.options.mockOnStatError === true) {
                    assert.isFunction(this.options.mockNext,
                                      'missing mockNext property in options');

                    // bubble the error up to the next() handler
                    this.options.mockNext(err);
                }
            },
            pipe: function (data, stat) {
                this.pipeWasCalled = true;
                this.mock = this.mock || {};
                this.mock.data = data;
                this.mock.stat = stat;

                // `next` is within the return function of `map`
                if (this.options.mockNext &&
                        typeof this.options.mockNext === "function") {
                    // passing the stream to the `next` handler so that we can
                    // query the `stream` for verifying some flags
                    this.options.mockNext(this);
                }
            }
        };

        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false,
            useCleanCache: true
        });

        mockery.registerMock('./middleware/static', staticMock);
        mockery.registerMock('./send', sendMock);

        libstatic = require('../../lib/static');
    }

    function deregisterMockery() {
        mockery.deregisterMock('./middleware/static');
        mockery.deregisterMock('./send');

        libstatic = undefined;
    }

    beforeEach(function () {
        // console.log('---- beforeEach ----');
        registerMockery();

        middlewareWasCalled = false;
        // reset the group registration
        libstatic._groups = undefined;
    });
    afterEach(function () {
        deregisterMockery();
    });

    describe('#getAssetFromFS', function () {
        it('should read file that exists', function () {
            var file = libpath.join(fixturesPath, "one.js");

            libstatic.getAssetFromFS(file, function (err, data) {
                assert.isNull(err, 'err object should be null');
                assert.isObject(data, 'data object should be set');
                assert.isObject(data.body, 'data.body not set');
                assert.isObject(data.stat, 'data.stat not set');
                assert.instanceOf(data.body, Buffer, 'data.body not an instance of Buffer');
            });
        });
        it('should return error when reading non-exisiting file', function () {
            // this file does not exist
            var file = libpath.join(fixturesPath, "phantom-file.js");

            libstatic.getAssetFromFS(file, function (err, data) {
                assert.isNotNull(err, 'err object should be null');
                assert.isUndefined(data, 'data object should be undefined');
                assert.strictEqual('File not found: ' + file,
                                   err.message,
                                   'wrong error message');
            });
        });
        // TODO: use mocks
        it('should return error when libfs.readFile() returnes error');
    });

    describe('#folder', function () {
        /**
        verify:
        - group is correctly registered
        - middleware is invoked as expected
        **/
        describe('Test group registration and middleware', function () {
            it('should run OK', function (done) {

                var rootPath,
                    config,
                    fn,
                    group,
                    req,
                    res;

                rootPath = libpath.join(fixturesPath, 'static');
                config = { foo: 'bar' };

                assert.isUndefined(libstatic._groups, 'no groups registered yet');
                fn = libstatic.folder('yui', rootPath, config);
                // console.log(fn.toString());

                assert.equal(1, libstatic._groups.length, 'at least one groups registered');

                group = libstatic._groups[0];
                assert.equal("/yui/", group.prefix, 'wrong prefix');
                assert.equal(rootPath, group.rootPath, 'wrong rootPath');
                assert.equal(config.foo, group.config.foo, 'wrong config');

                //
                req = {
                    url: '/yui/foo/foo-debug.js',
                    method: 'GET'
                };

                fn(req, res, function (err) {
                    assert.isUndefined(err, 'err unexpected');

                    assert.strictEqual(true, middlewareWasCalled, 'middleware was not called');
                    done();
                });
            });

            describe('Test invalid request', function () {
                it('should fall through', function (done) {

                    var fn, req, res;

                    fn = libstatic.folder('yui', '/somewhere/', {});

                    req = {
                        url: '/nonyui/foo/foo-debug.js',
                        method: 'GET'
                    };

                    fn(req, res, function () {
                        assert.isFalse(middlewareWasCalled,
                                       'express.static should ' +
                                       'not be called');

                        done();
                    });
                });
            });

            describe('Test invalid method', function () {
                it('should fall through', function (done) {

                    var fn, req, res;

                    fn = libstatic.folder('yui', '/somewhere/', {});

                    req = {
                        url: '/yui/foo/foo-debug.js',
                        method: 'POST'
                    };

                    fn(req, res, function () {
                        // console.log(req);

                        assert.isFalse(middlewareWasCalled,
                                       'express.static should ' +
                                       'not be called');

                        done();
                    });
                });
            });
        });
    });

    describe('#map', function () {
        // assumptions:
        // - mapping is valid
        // - group registration is OK
        // - static middleware is returned OK
        // - resource requested is this file itself (for testing)
        // verify:
        it('should read from FS with valid mapping', function () {

            // console.log('---- #map was called ----');

            var fn,
                req,
                res,
                nextHandler,
                getAssetFromFSfn,
                maxageWasCalled = false,
                pipeWasCalled = false;

            getAssetFromFSfn = libstatic.getAssetFromFS;

            req = {
                url: '/yui/one.html',
                method: 'GET'
            };

            libstatic.getAssetFromFS = function (path, cb) {
                assert.strictEqual('/root/one.html',
                                   path,
                                   'wrong path');

                // // console.log('--- getAssetFromFS was called ----');

                cb(null, { body: 'body', stat: { key: 'value' } });
            };
            nextHandler = function (sendStream) {
                // // console.log('--- CB was called ----');
                assert.isTrue(sendStream.maxageWasCalled,
                              'SendStream.maxage was not called');
                assert.isTrue(sendStream.pipeWasCalled,
                              'SendStream.pipe was not called');
                // restore
                libstatic.getAssetFromFS = getAssetFromFSfn;
            };

            // do real work
            fn = libstatic.map('yui', {
                "one.html": "/root/one.html"
            }, { maxAge: 200, foo: 'bar', mockNext: nextHandler });

            assert.isFunction(fn, 'return value of #map should be a function');
            assert.equal(1, libstatic._groups.length,
                          'only 1 group expected');
            assert.deepEqual({"one.html": "/root/one.html"},
                             libstatic._groups[0].urls,
                             "wrong urls mapping");
            assert.strictEqual('bar',
                               libstatic._groups[0].config.foo,
                               'wrong config value');

            // HACK: stream.pipe does not call next, so need a way to get this
            // cb called
            fn(req, res, nextHandler);


        });

        // should pass error if getAssetFromFS encounter error
        it('should return error if getAssetFromFS fails', function () {
            var fn,
                callbackWasCalled = false,
                res,
                req,
                getAssetFromFSfn,
                nextHandler;

            // need to override this, otherwise the call is async
            getAssetFromFSfn = libstatic.getAssetFromFS;
            libstatic.getAssetFromFS = function (path, cb) {
                cb("Error reading file");
            };

            req = {
                url: '/foo/dir/one.html',
                method: 'GET'
            };

            nextHandler = function (err) {
                callbackWasCalled = true;
                // console.log('--- ' + err + ' ----');
                assert.isString(err, 'err should be set');
                assert.strictEqual("Error reading file",
                                   err,
                                   "wrong error message");
            };
            // note that /foo/ does not match /dir/
            fn = libstatic.map('foo', {
                'dir/one.html': __dirname + '/public/dir/one.html'
            }, {
                // tell our mock to return error on this
                mockNext: nextHandler,
                mockOnStatError: true
            });
            fn(req, res, nextHandler);
            assert.isTrue(callbackWasCalled, 'callback was not called');

            //
            libstatic.getAssetFromFS = getAssetFromFSfn;
        });

        // should pass error if SendStream encounters error while streaming
        it('should return error if SendStream fails', function () {
            var fn,
                callbackWasCalled = false,
                res,
                req,
                getAssetFromFSfn;

            // need to override this, otherwise the call is async
            getAssetFromFSfn = libstatic.getAssetFromFS;
            libstatic.getAssetFromFS = function () { };

            req = {
                url: '/foo/dir/one.html',
                method: 'GET'
            };

            // note that /foo/ does not match /dir/
            fn = libstatic.map('foo', {
                'dir/one.html': __dirname + '/public/dir/one.html'
            }, {
                // tell our mock need to simulate error
                mockOnError: true
            });
            fn(req, res, function (err) {
                callbackWasCalled = true;
                // console.log('--- ' + err + ' ----');
                assert.isString(err, 'err should be set');
                assert.strictEqual("Error streaming data",
                                   err,
                                   "wrong error message");
            });
            assert.isTrue(callbackWasCalled, 'callback was not called');

            //
            libstatic.getAssetFromFS = getAssetFromFSfn;
        });

        // should skip to the next middleware if req.method is invalid
        it('should skip if req.method is invalid', function () {
            var fn,
                callbackWasCalled = false,
                res,
                req;

            // note that /foo/ does not match /dir/
            fn = libstatic.map('foo', {
                'dir/one.html': __dirname + '/public/dir/one.html'
            }, { });
            req = {
                url: '/foo/dir/one.html',
                method: 'POST'
            };
            fn(req, res, function (err) {
                callbackWasCalled = true;
                assert.isUndefined(err, 'unexpected error');
            });
            assert.isTrue(callbackWasCalled, 'callback was not called');
        });


        // should skip to the next middleware if no group mapping is found
        it('should skip if no mapping', function () {
            var fn,
                callbackWasCalled = false,
                res,
                req;

            // note that /foo/ does not match /dir/
            fn = libstatic.map('foo', {
                'dir/one.html': __dirname + '/public/dir/one.html'
            }, { });
            req = {
                url: '/bar/dir/one.html'
            };
            fn(req, res, function (err) {
                callbackWasCalled = true;
                assert.isUndefined(err, 'unexpected error');
            });
            assert.isTrue(callbackWasCalled, 'callback was not called');
        });
    });


    describe('#combine', function () {

        function registerTestGroups() {
            var rootDir = __dirname + '/../fixtures';
            // Expose the `fixtures` directory under public
            libstatic.folder('public', rootDir, {
                // express.static options here
            });
            libstatic.map('app', {
                'public/one.js': rootDir + '/public/one.js',
                'public/two.js': rootDir + '/public/two.js'
            }, {
                // express.static options here
            });

            // console.log(libstatic._groups);
        }

        // assumption:
        // - no errors
        // verify:
        // - files are `piped` as expected
        //
        // NOTE: error handling are done in subsequent tests
        describe('Normal flow with no errors', function () {
            it('should pipe files OK', function () {
                var config,
                    fn,
                    req,
                    res,
                    getAssetFromFSfn,
                    nextHandler,
                    nextHandlerWasCalled = false;

                getAssetFromFSfn = libstatic.getAssetFromFS;
                libstatic.getAssetFromFS = function (path, cb) {
                    // console.log('---- path: ' + path);
                    var data,
                        body;
                    body = '-two-';
                    if (path.indexOf('one.js') > -1) {
                        body = '-one-';
                    }
                    data = {
                        stat: { mtime: Date().now },
                        body: new Buffer(body)
                    };
                    cb(null, data);
                };
                nextHandler = function (stream) {
                    nextHandlerWasCalled = true;
                    assert.isObject(stream, 'SendStream instance expected');
                    assert.isTrue(stream.pipeWasCalled,
                                  'stream.pipe was not called');

                    assert.isString(stream.mock.data,
                                    'stream.data provided invalid data string');
                    assert.isObject(stream.mock.stat,
                                    'stream.pipe provided invalid stat object');
                    // // console.log('---- data: ' + stream.mock.data);
                    assert.strictEqual('-one--two-',
                                       stream.mock.data,
                                       'data does not match');
                };

                config = {
                    comboSep: '#',
                    comboBase: '/appcombo?',
                    // mock
                    mockNext: nextHandler
                };
                registerTestGroups();
                // NOTE: how the /<group>/ is part of the url
                req = {
                    url: config.comboBase + '/app/public/one.js#/app/public/two.js',
                    method: 'GET'
                };

                fn = libstatic.combine(config);
                assert.isFunction(fn,
                                    'returned value from libstatic.combine ' +
                                    'should be a function');

                fn(req, res, nextHandler);

                assert.isTrue(nextHandlerWasCalled, 'next() was not called');

                libstatic.getAssetFromFS = getAssetFromFSfn;
            });
        });

        // verify:
        // - skip to the next middleware
        // - no error is passed back
        // - no call is made on stream.pipe|error|onStatError
        describe('Test url that do not match the comboBase', function () {
            it('should skip to the next middleware', function () {
                var fn,
                    req,
                    res;

                registerTestGroups();
                // should not match `/app/`
                req = { url: "/nonmatchingcombobase/foo/bar", method: "GET" };

                fn = libstatic.combine({
                    comboBase: '/combo?',
                    comboSep: '~'
                });

                fn(req, res, function (err) {
                    assert.isUndefined(err, 'no error expected');
                    // verify that this.pipe was not called
                });
            });
        });

        // verify:
        // - skip to the next middleware
        // - no error is passed back
        // - no call is made on stream.pipe|error|onStatError
        describe('Test req.method that is invalid', function () {
            it('should skip to the next middleware', function () {
                var fn,
                    req,
                    res;

                registerTestGroups();
                // pay attention to the combo req format here
                req = { url: "/combo?/app/public/one.js", method: "POST" };

                fn = libstatic.combine({
                    comboBase: '/combo?',
                    comboSep: '~'
                });

                fn(req, res, function (err) {
                    assert.isUndefined(err, 'no error expected');
                    // verify that this.pipe was not called
                });
            });
        });

        // verify:
        // - stream.on('error') error is handled correctly
        describe('Test stream.on(error) is handled correctly', function () {
            it('should call next(err)', function () {
                var fn,
                    nextHandler,
                    req,
                    res,
                    nextHandlerWasCalled = false;

                registerTestGroups();
                nextHandler = function (err) {
                    nextHandlerWasCalled = true;
                    assert.isString(err, 'err String expected');
                    assert.strictEqual('Error streaming data',
                                       err,
                                       'wrong error message');

                };
                req = { url: '/foo/bar/one.js', method: 'GET' };

                fn = libstatic.combine({
                    // SendStream mock
                    mockNext: nextHandler,
                    mockOnError: true // Error streaming data
                });
                fn(req, res, nextHandler);

                assert.isTrue(nextHandlerWasCalled, 'next() was not called by fn');

            });
        });

        // Test #combine with folder() instead of map() so that normalize() can
        // be tested
        // verify:
        // - group is setup with `folder` with groupName `public` with the
        // `fixtures` directory as the `rootDir`
        // - that the url passed to getAssetFromFS() matches expected URL
        //
        // What we are not testing:
        // - if SendStream.pipe() is being called
        describe('Test combine() with folder() mapping instead of map()', function () {
            it('should return contents of robot.txt OK', function () {
                var fn,
                    req,
                    res,
                    getAssetFromFSfn,
                    getAssetFromFSwasCalled = false;

                getAssetFromFSfn = libstatic.getAssetFromFS;
                libstatic.getAssetFromFS = function (path, cb) {
                    getAssetFromFSwasCalled = true;
                    // console.log('--> path    : %s', path);
                    // console.log('--> expected: %s', libpath.join(__dirname, '..', 'fixtures', 'robot.txt'));
                    assert.strictEqual(libpath.normalize(path),
                                      libpath.normalize(libpath.join(__dirname, '..', 'fixtures', 'robot.txt')),
                                      'wrong path expected: check normalize()');
                };
                registerTestGroups();
                req = { url: '/combo?/public/robot.txt', method: 'GET' };
                fn = libstatic.combine({
                    comboBase: '/combo?'
                });
                fn(req, res, function () {
                    // nothing to assert here
                });

                assert.isTrue(getAssetFromFSwasCalled,
                              'getAssetFromFS was not called');
                libstatic.getAssetFromFS = getAssetFromFSfn;
            });
        });

        describe('Test mixed content types', function () {
            it('should call stream.error');
        });
    });

    //////////////////////////////////////////////////////////////////////////
    // non-public interface
    //////////////////////////////////////////////////////////////////////////

    describe('#getGroupFromURL', function () {
        it('should match expected groups', function () {

            var group;

            libstatic._groups = libstatic._groups || [];
            libstatic._groups.push({
                prefix: '/yui/',
                rootPath: '/somewhere/',
                config: { }
            });

            group = libstatic.getGroupFromURL('/yui/foo/foo-debug/js');

            assert.deepEqual(libstatic._groups[0],
                             group,
                             'wrong group');

        });
        it('should return undefined for invalid url', function () {

            var group = libstatic.getGroupFromURL();

            assert.isUndefined(group,
                               'group should be undefined for invalid url');
        });
        it('should return undefined for url that do not match', function () {
            var group;

            libstatic._groups = libstatic._groups || [];
            libstatic._groups.push({
                prefix: '/yui/',
                rootPath: '/etc',
                config: {}
            });

            group = libstatic.getGroupFromURL('/foo/bar/somewhere.js');
            assert.isUndefined(group, 'no group should be returned');

        });
    });

    describe('#_registerGroup', function () {
        it('should match expected groups', function () {

            libstatic._groups = undefined;

            libstatic._registerGroup('foo');
            libstatic._registerGroup('bar');

            assert.isTrue(2 === libstatic._groups.length,
                          'wrong number of groups');
            assert.strictEqual('foo', libstatic._groups[0], 'expected `foo`');
            assert.strictEqual('bar', libstatic._groups[1], 'expected `bar`');
        });
    });

    describe('#getContentType', function () {
        it('should return correct mimetype', function () {

            var fixtures,
                url,
                mt;

            fixtures = {
                '/foo/bar.js': 'application/javascript;charset=utf-8',
                '/foo/bar.css': 'text/css;charset=utf-8',
                '/foo/bar.html': 'text/html;charset=utf-8',
                '/foo/bar.htm': 'text/html;charset=utf-8',
                '/foo/bar.txt': 'text/plain;charset=utf-8'
            };

            for (url in fixtures) {
                if (fixtures.hasOwnProperty(url)) {
                    mt = libstatic.getContentType(url);

                    assert.strictEqual(fixtures[url],
                                       mt,
                                       'wrong mime type');
                }
            }
        });
    });
});
