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
    // libstatic = require('../../lib/static'),
    libstatic,
    mockery = require('mockery'),
    fixturesPath = libpath.join(__dirname, '../fixtures');

describe('static', function () {

    // flag to track express.static
    var middlewareWasCalled,
        // libstatic;
        staticMock, // express.static
        sendMock; // SendStream

    function registerMockery() {

        // var sendMock,
        //     staticMock;

        staticMock = function (rootPath, options) {
            return function (req, res, next) {
                middlewareWasCalled = true;
                next();
            };
        };

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
            on: function (event, cb) {
                if (event === "error") {
                    if (this.options.mockOnError &&
                            this.options.mockOnError === true) {
                        console.log('---- mockOnError ----');
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
                // TODO: how to assert data + stat ?
                this.pipeWasCalled = true;

                // `next` is within the return function of `map`
                if (this.options.mockNext &&
                        typeof this.options.mockNext === "function") {
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
        registerMockery();

        middlewareWasCalled = false;
        // reset the group registration
        libstatic.setGroups(undefined);
    });
    afterEach(function () {
        deregisterMockery();
    });

    describe('#dedupe', function () {
        it('should remove all dupes OK', function () {
            var input = [1, 2, 3, "hello", 3, 3, 2, 1, "hello"],
                expected = [1, 2, 3, "hello"],
                out,
                i;
            out = libstatic.dedupe(input);
            assert.isArray(out, 'return value of dedupe should be an Array');
            assert.isTrue(expected.length === out.length, 'wrong array length');

            for (i = 0; i < out.length; i = i + 1) {
                assert.isTrue(expected.indexOf(out[i]) > -1,
                              'item ' + out[i] + ' not expected');
            }
        });
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

                assert.isUndefined(libstatic.getGroups(), 'no groups registered yet');
                fn = libstatic.folder('yui', rootPath, config);
                // console.log(fn.toString());

                assert.equal(1, libstatic.getGroups().length, 'at least one groups registered');

                group = libstatic.getGroups()[0];
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
                        console.log(req);

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

            console.log('---- #map was called ----');

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

                console.log('--- getAssetFromFS was called ----');

                cb(null, { body: 'body', stat: { key: 'value' } });
            };
            nextHandler = function (sendStream) {
                console.log('--- CB was called ----');
                assert.isTrue(sendStream.maxageWasCalled,
                              'SendStream.maxage was not called');
                assert.isTrue(sendStream.pipeWasCalled,
                              'SendStream.pipe was not called');
                // restore
                getAssetFromFSfn = libstatic.getAssetFromFS;
            };

            // do real work
            fn = libstatic.map('yui', {
                "one.html": "/root/one.html"
            }, { maxAge: 200, foo: 'bar', mockNext: nextHandler });

            assert.isFunction(fn, 'return value of #map should be a function');
            assert.equal(1, libstatic.getGroups().length,
                          'only 1 group expected');
            assert.deepEqual({"one.html": "/root/one.html"},
                             libstatic.getGroups()[0].urls,
                             "wrong urls mapping");
            assert.strictEqual('bar',
                               libstatic.getGroups()[0].config.foo,
                               'wrong config value');

            // HACK: stream.pipe does not call next, so need a way to get this
            // cb called
            fn(req, res, nextHandler);


        });

        // XX;
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
                console.log('--- ' + err + ' ----');
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
                console.log('--- ' + err + ' ----');
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
        it('should register OK');
    });

    // non-public interface

    describe('#getGroupFromURL', function () {
        it('should match expected groups', function () {

            var group;

            libstatic.addGroup({
                prefix: '/yui/',
                rootPath: '/somewhere/',
                config: { }
            });

            group = libstatic.getGroupFromURL('/yui/foo/foo-debug/js');

            assert.deepEqual(libstatic.getGroups()[0],
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

            libstatic.addGroup({
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

            libstatic.setGroups(undefined);

            libstatic._registerGroup('foo');
            libstatic._registerGroup('bar');

            assert.isTrue(2 === libstatic.getGroups().length,
                          'wrong number of groups');
            assert.strictEqual('foo', libstatic.getGroups()[0], 'expected `foo`');
            assert.strictEqual('bar', libstatic.getGroups()[1], 'expected `bar`');
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
