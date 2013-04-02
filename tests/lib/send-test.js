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
    mockery = require('mockery'),
    SendStream = require('../../lib/send'),
    StringStream = require('../../lib/string'),
    fixturesPath = libpath.join(__dirname, '../fixtures');

describe('send', function () {
    var stream,
        res,
        options;

    beforeEach(function () {
        // create a minium usable SendStream instance.
        // individual test case can create their own SendStream as necessary
        res = {
            req: { originalUrl: '/foo/bar', headers: { } }
        };
        options = { foo: 'bar' };
        stream = new SendStream(res, options);
    });
    afterEach(function () {
        res = null;
        options = null;
        stream = null;
    });

    describe('Test SendStream constructor', function () {
        it('should init properties', function () {
            // overwrite the default `stream`
            stream = new SendStream(res, options);

            assert.deepEqual(res,
                             stream.res,
                             'wrong stream.res');
            assert.deepEqual(res.req,
                             stream.req,
                             'wrong stream.req');
            assert.strictEqual(res.req.originalUrl,
                             stream.path,
                             'wrong stream.path');
            assert.deepEqual(options,
                             stream.options,
                             'wrong stream.options');
            assert.strictEqual(0, stream._maxage, 'wrong maxage');
        });
    });


    describe('Test #maxage', function () {
        it('should set _maxage to 1 year', function () {
            stream.maxage(Infinity);
            assert.strictEqual(60 * 60 * 24 * 365 * 1000,
                               stream._maxage,
                               'wrong _maxage');
        });
    });

    describe('Test #error', function () {
        it('should write correct code + msg to response', function () {
            var endCalled = false;

            res = {
                req: { originalUrl: '/foo/bar' },
                end: function (msg) {
                    endCalled = true;
                    assert.strictEqual('Internal Server Error',
                                       msg,
                                       'wrong error message');
                    assert.strictEqual(500,
                                       res.statusCode,
                                       'wrong statusCode for errorCode');
                }
            };
            stream = new SendStream(res, options);
            stream.error(500, new Error('Error sending response'));

            assert.isTrue(endCalled, 'res.end() was not called');
        });
    });

    describe('Test #isConditionalGET', function () {
        it('should return TRUE with the correct headers', function () {
            res = {
                req: {
                    originalUrl: '/foo/bar',
                    headers: {
                        'if-none-match': '12345',
                        'if-modified-since': 'Dec 25 19920'
                    }
                }
            };
            stream = new SendStream(res, options);
            var isCond = stream.isConditionalGET();
            assert.ok(isCond, 'request should be a conditionalGET');

        });
        it('should return FALSE with the missing required headers', function () {
            res = {
                req: {
                    originalUrl: '/foo/bar',
                    headers: { }
                }
            };
            var isCond = stream.isConditionalGET();
            assert.isUndefined(isCond, 'request missing conditionalGET ' +
                               'headers and should be FALSE');
        });
    });

    describe('Test #removeContentHeaderFields', function () {
        it('should remove any header with content', function () {
            res = {
                _headers: {
                    'foo-type': 'FOO',
                    'content-type': 'CONTENTTYPE'
                },
                req: { originalUrl: '' },
                removeHeader: function (f) {
                    delete this._headers['content-type'];
                }
            };
            stream = new SendStream(res, {});

            stream.removeContentHeaderFields();
            // console.log(stream.res._headers);
            assert.strictEqual(1, Object.keys(stream.res._headers).length,
                               'wrong # of headers');
        });
    });

    describe('Test #notModified', function () {
        it('should remove any header with content and set 304', function () {
            var endCalled = false,
                removeCalled = false,
                res;

            res = {
                req: { originalUrl: '' },
                end: function () {
                    endCalled = true;
                }
            };
            stream = new SendStream(res, {});
            stream.removeContentHeaderFields = function () {
                removeCalled = true;
            };

            stream.notModified();

            assert.isTrue(endCalled, 'res.end() was not called');
            assert.isTrue(removeCalled,
                          'stream.removeContentHeaderFields() was not called');
        });
    });

    describe('Test #isCachable', function () {
        it('should return FALSE if response is not cachable', function () {
            // use default stream
            res = {
                req: { originalUrl: '' },
                statusCode: 404
            };
            stream = new SendStream(res, {});

            assert.isFalse(stream.isCachable(), 'response is not cachable');
        });
        it('should return TRUE if response is cachable', function () {
            res = {
                req: { originalUrl: '' },
                statusCode: 304
            };
            stream = new SendStream(res, {});

            assert.isTrue(stream.isCachable(), 'response is cachable');
        });
    });

    describe('Test #onStatError', function () {
        it('should call this.error with the given known error', function () {

            var errorCalled = false;
            // use default stream
            stream.error = function (code, msg) {
                errorCalled = true;
                assert.strictEqual(404, code, 'wrong error code');
                assert.deepEqual({ code: 'ENOENT' }, msg, 'wrong error msg');
            };

            stream.onStatError({ code: 'ENOENT' });

            assert.isTrue(errorCalled, 'stream.error was not called');
        });

        it('should call this.error with unknown error', function () {

            var errorCalled = false;
            // use default stream
            stream.error = function (code, msg) {
                errorCalled = true;
                assert.strictEqual(500, code, 'wrong error code');
                assert.deepEqual({ code: 500, message: 'Server error' },
                                 msg,
                                 'wrong error msg');
            };

            stream.onStatError({ code: 500, message: 'Server error' });

            assert.isTrue(errorCalled, 'stream.error was not called');
        });
    });

    describe('Test #isFresh', function () {
        it('should call fresh', function () {
            var isFresh = false,
                freshMock,
                SS;

            res = {
                req: { headers: { fu: 'baz' }, originalUrl: '' },
                _headers: { foo: 'bar' }
            };

            freshMock = function () {
                assert.strictEqual(2,
                                   arguments.length,
                                   'expected 2 arguments');
                assert.deepEqual(res.req.headers,
                                    Array.prototype.shift.apply(arguments),
                                    'wrong res.req.headers');
                assert.deepEqual(res._headers,
                                    Array.prototype.shift.apply(arguments),
                                    'wrong res._headers');
                return true;
            };

            mockery.enable({ useCleanCache: true });
            mockery.registerMock('fresh', freshMock);

            // use default `res` instance
            SS = require('../../lib/send');
            stream = new SS(res, {});
            isFresh = stream.isFresh();
            assert.isTrue(isFresh, 'isFresh() should return true');

            mockery.deregisterMock('fresh');
            mockery.disable();
        });
    });


    // objective:
    describe('Test #pipe', function () {
        it('should call SendStream.send()', function () {
            var sendCalled = false,
                mockData,
                mockStat;
            mockData = 'TESTING';
            mockStat = {
            };
            // use default stream instance
            // /foo/bar?raise=25%
            stream.path = '/foo/bar?raise=25%25';

            // mock SendStream.send()
            stream.send = function (data, stat) {
                sendCalled = true;
                assert.strictEqual(mockData,
                                   data,
                                   'wrong data expected');
                assert.deepEqual(mockStat,
                                 stat,
                                 'wrong stat expected');
            };

            stream.pipe(mockData, mockStat);

            assert.isTrue(sendCalled, 'stream.send() was not called');
        });

        it('should return error when decode fails', function () {
            var errorCalled = false;
            // use default `stream`
            // set the path that is invalid
            // stream.path = '/foo/$@*^';
            stream.path = 'http:////foobar#$%^';
            stream.error = function (code) {
                errorCalled = true;
                assert.strictEqual(400, code, 'expected error code 400');
            };
            stream.pipe('TESTING', { });

            assert.isTrue(errorCalled, 'stream.error() should have been called');
        });

        it('should return error when path is null', function () {
            var errorCalled = false;
            // use default `stream`
            // set the path to null
            stream.path = '/foo/\u0000';
            stream.error = function (code) {
                errorCalled = true;
                assert.strictEqual(400, code, 'expected error code 400');
            };
            stream.pipe('TESTING', { });

            assert.isTrue(errorCalled, 'stream.error() should have been called');
        });
    });


    // description:
    // - verify that setHeader() is called
    // - verify that type() is called
    describe('Test #send', function () {

        it('should stream.', function () {
            var setHeaderCalled = false, // SendStream.setHeader
                resSetHeaderCalled = false, // res.setHeader
                typeCalled = false, // SendStream.type
                streamCalled = false, // SendStream.stream
                res,
                stat;

            res = {
                req: {
                    originalUrl: '/foo/index.html',
                    headers: {
                       // no range 
                    }
                },
                setHeader: function (name, value) {
                    resSetHeaderCalled = true;
                    assert.strictEqual('Content-Length',
                                       name,
                                       'wrong header name');
                    // based on stat.size
                    assert.strictEqual(100, value, 'wrong content-length');
                }
            };
            stat = {
                size: 100
            };

            stream = new SendStream(res, {foo: 'bar' });
            stream.setHeader = function (st) {
                setHeaderCalled = true;
                assert.deepEqual(stat,
                                 st,
                                 'wrong stat object passed in');
            };
            stream.type = function (ppath) {
                typeCalled = true;
                assert.strictEqual(res.req.originalUrl,
                                   ppath,
                                   'wrong path');
            };
            stream.stream = function (data, options) {
                streamCalled = true;
                assert.strictEqual('TESTING', data, 'wrong data');
                assert.deepEqual({ foo: 'bar' }, // options passed to SendStream
                                 options,
                                 'wrong options');
            };


            stream.send('TESTING', stat);

            assert.isTrue(setHeaderCalled, 'setHeader(stat) was not called');
            assert.isTrue(resSetHeaderCalled, 'res.setHeader() was not called');
            assert.isTrue(typeCalled, 'type(path) was not called');
            assert.isTrue(streamCalled, 'stream(data, stat) was not called');
        });

        // verify that this.notModified() is called
        it('should support conditional GET', function () {
            var notModifiedCalled = false;

            // use default stream
            stream.setHeader = function () { };
            stream.type = function () { };
            stream.isConditionalGET = function () { return true; };
            stream.isCachable = function () { return true; };
            stream.isFresh = function () { return true; };
            stream.notModified = function () {
                notModifiedCalled = true;
            };

            stream.send('XX', { });

            assert.isTrue(notModifiedCalled, 'SendStream.notModifed() was not called');
        });


        // 
        it('should support content range', function () {
            var setHeaderContentRangeCalled = false,
                setHeaderContentLengthCalled = false;

            // use default stream
            // only reques the 2nd 20-bytes range
            res = {
                req: {
                    originalUrl: '/foo/index.html',
                    headers: {
                        // range to return
                        range: "bytes=20-40"
                    }
                },
                setHeader: function (name, value) {
                    if (name === "Content-Range") {
                        setHeaderContentRangeCalled = true;
                        assert.strictEqual('bytes 20-40/100',
                                           value,
                                           'unexpected content-range value');
                    } else if (name === "Content-Length") {
                        setHeaderContentLengthCalled = true;
                        assert.strictEqual(21,
                                           value,
                                           'unxpected content-length');
                    }
                }
            };
            // passing range in options is an alternative to `range` header
            // stream = new SendStream(res, { start: 200, end: 400});
            stream = new SendStream(res, { });

            stream.setHeader = function () { };
            stream.type = function () { };
            stream.isConditionalGET = function () { return false; };
            stream.stream = function () { };

            // expected offset is 80
            stream.send('XX', { size: 100 });

            assert.isTrue(setHeaderContentRangeCalled,
                          'setHander(Content-Range) was not called');
            assert.isTrue(setHeaderContentLengthCalled,
                          'setHander(Content-Length) was not called');

        });

        it('should support bad content range by returning error', function () {

            var setHeaderContentRangeCalled = false,
                errorCalled = false;
            res = {
                req: {
                    originalUrl: '/foo/index.html',
                    headers: {
                        // should cause parseRange to return -1
                        range: 'bytes=aa-bb'
                    }
                },
                setHeader: function (name, value) {
                    if ("Content-Range" === name) {
                        setHeaderContentRangeCalled = true;
                        assert.strictEqual("bytes**/200",
                                           value,
                                           "range should be `bytes**/200`");
                    }
                }
            };

            stream = new SendStream(res, { });
            stream.setHeader = function () { };
            stream.type = function () { };
            stream.isConditionalGET = function () { return false; };
            stream.stream = function () { };

            stream.error = function (code) {
                errorCalled = true;
                assert.strictEqual(416, code, 'error code should be 416');
            };

            // OK go
            stream.send('XX', { size: 200 });

            assert.isTrue(errorCalled,
                          'SendStream.error() was not called with error code 416');
            assert.isTrue(setHeaderContentRangeCalled,
                          'setHeader(Content-Range) was not called when ranges === -1');
        });

        // verify:
        // - if the method is HEAD, then close the response with res.end();
        it('should res.send() if method === HEAD', function () {
            var resEndCalled = false;

            res = {
                req: {
                    method: 'HEAD',
                    originalUrl: '/foo/index.html',
                    headers: { }
                },
                setHeader: function () { },
                end: function () {
                    resEndCalled = true;
                }
            };

            stream = new SendStream(res, {});
            stream.setHeader = stream.type = function () { };
            stream.isConditionalGET = function () { return false; };

            // use default `stream`
            stream.send('XX', { });

            assert.isTrue(resEndCalled, 'res.end() was not called');
        });
    });

    // objective:
    // - verity that StringStream is piped
    // - error handlers are triggered
    // - `end` event is emitted as expected
    describe('Test #stream', function () {
        // verify:
        // - stream.pipe(res) is called with correct argument
        it('should emit the expected events', function () {
            var pipeCalled = true;

            // setup mock for the event registration
            res.req.on = function (event, cb) {
                // should register the 'close' event
                assert.strictEqual('close',
                                    event,
                                    'wrong event on req.on()');
            };

            // use the default `stream` instance in this test
            stream.on('stream', function (ss) {
                // console.log('on_stream');

                // hijack the `pipe` method
                ss.pipe = function (r) {
                    pipeCalled = true;
                    assert.deepEqual(res, r, 'wrong response');
                };
                ss.on = function (event, cb) {
                    var events = ['error', 'end'];
                    assert.isTrue(events.indexOf(event) > -1,
                                  'unexpected event registration: "' + event + '"');
                };
                assert.isTrue(ss instanceof StringStream,
                              'Emitted stream should be an instance of StringStream');
            });
            stream.stream('TESTING', { });

            // assert.isTrue(resOnCalled, 'res.on() `data` event was not emitted');
            assert.isTrue(pipeCalled, 'ss.pipe() was not called');
        });

        // verify:
        // - stream.on('error') handler is called and set correct error code
        //
        // NOTE:
        it('should emit the expected events', function () {

            var sendStreamEmitErrorCalled = false,
                sendStreamEmitEndCalled = false;

            res = {
                req: {
                    originalUrl: '/foo',
                    destroy: function () { },
                    on: function (e, cb) { }
                },
                _headers: { }
            };

            stream = new SendStream(res, { });
            // register events on `SendStream` first: `error`, `end`
            // these events will be triggered by the `StringStream`
            stream.on('error', function (e) {
                sendStreamEmitErrorCalled = true;
                assert.strictEqual(500,
                                   e.status,
                                   'err.status should be 500');
            });
            stream.on('end', function (e) {
                sendStreamEmitEndCalled = true;
            });

            stream.on('stream', function (ss) {
                // stream the `StringStream` instance and fake `emits`
                ss.pipe = function () { };
                ss.on = function (e, cb) {
                    if (e === "error") {
                        cb(new Error("ErrorONE"));
                    } else if (e === "end") {
                        cb();
                    }
                };
            });
            stream.stream('TESTING', { });

            assert.isTrue(sendStreamEmitErrorCalled,
                          'self.emit(error, err) was not called!');
            assert.isTrue(sendStreamEmitEndCalled,
                          'self.emit(end) was not called!');
        });

        /*
        // verify:
        // - stream.on('event') is emitted to make sure the pipe is closed
        it('should emit the expected events', function () {
            var data,
                options;

            data = 'FOO-BAR';
            options = { };
            stream.stream(data, options);
            assert.fail('implement me');
        });
        */
    });


    describe('Test #type', function () {
        it('should do nothing if Content-Type has already been set', function () {
            res = {
                req: { originalUrl: '/foo/bar' },
                getHeader: function () {
                    assert.ok('ok', 'getHeader should be called');
                    return 'SomeTruthyValue';
                },
                setHeader: function () {
                    assert.isFalse(true, 'res.setHeader should not be called');
                }
            };
            stream = new SendStream(res, {});
            stream.type('/foo.html');
        });

        it('should setHeader if Content-Type has not been set', function () {
            res = {
                req: { originalUrl: '/foo/bar.html' },
                getHeader: function () {
                    assert.ok('ok', 'getHeader should be called');
                    // simulate "header content-type" has already been set
                    return;
                },
                setHeader: function (name, value) {
                    assert.isTrue(true, 'res.setHeader should be called');
                    assert.strictEqual('Content-Type',
                                       name,
                                       'header name should be Content-Type');
                    assert.strictEqual('text/html; charset=UTF-8',
                                       value,
                                       'wrong content type');
                }
            };
            stream = new SendStream(res, {});
            stream.type('/foo.html');
        });

    });


    describe('Test #setHeader', function () {
        it('should set set of headers based on fs.stat', function () {

            var stat;

            // use default options
            stat = {
                size: 100,
                mtime: new Date()
            };
            res = {
                _store: { },
                originalUrl: '/foo/bar',
                req: { },
                getHeader: function (name) {
                    return this._store[name];
                },
                setHeader: function (name, value) {
                    var checked = false,
                        now = Date.parse(new Date().toUTCString()),
                        tmp;

                    console.log('setHeader: ' + name);
                    this._store[name] = value;

                    switch (name) {
                    case "Accept-Ranges":
                        checked = true;
                        assert.strictEqual("bytes", value, "wrong Accept-Ranges");
                        break;
                    case "ETag":
                        // return '"' + stat.size + '-' + Number(stat.mtime) +
                        // '"';
                        // console.log(':::' + value);
                        checked = true;
                        assert.strictEqual('"100-' + Number(stat.mtime) + '"',
                                           value,
                                           "wrong Etag value");
                        break;
                    case "Date":
                        checked = true;
                        assert.strictEqual(now / 1000,
                                       Date.parse(value) / 1000,
                                       "The dates are not close enough: " +
                                        value + " vs " +
                                        new Date(now).toUTCString());
                        break;
                    case "Cache-Control":
                        checked = true;
                        assert.strictEqual("public, max-age=20",
                                           value,
                                           "The maxage value did not match");
                        break;
                    case "Last-Modified":
                        checked = true;
                        assert.strictEqual(stat.mtime.toUTCString(),
                                           value,
                                           "wrong Last-Modified date");
                        break;
                    default:
                        value = undefined;
                    }

                    assert.isTrue(checked,
                                  "setHeader(" + name + ", xxx) was not called");
                }
            };
            stream = new SendStream(res, {});
            stream.maxage(20000); // 20 secs

            stream.setHeader(stat);
            stream.setHeader(stat);
            stream.setHeader(stat);
            stream.setHeader(stat);
            stream.setHeader(stat);
        });
    });
});

