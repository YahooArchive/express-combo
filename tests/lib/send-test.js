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
    // libsend = require('../../lib/send'),
    // SendStream = libsend.SendStream,
    SendStream = require('../../lib/send'),
    mockery = require('mockery'),
    fixturesPath = libpath.join(__dirname, '../fixtures');

describe('send', function () {
    var stream,
        res,
        options;

    function initResponse(r, o) {
        if (r) {
            res = r;
        } else {
            res = {
                req: {
                    originalUrl: '/foo/bar',
                    headers: { }
                }
            };
        }
        if (o) {
            options = o;
        } else {
            options = { foo: 'bar' };
        }
    }

    beforeEach(function () {
        initResponse();
        stream = new SendStream(res, options);
    });
    afterEach(function () {
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

    // removeContentHeaderFields : WIP
    // notModified
    // isCachable
    // onStatError
    // isFresh
    // pipe
    // send
    // stream


    describe('#removeContentHeaderFields', function () {
        it('should remove any header with content', function () {
            var res = {
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

    describe('#notModified', function () {
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

    describe('#isCachable', function () {
        it('should return FALSE if response is not cachable', function () {
            // use default stream
            var res;
            res = {
                req: { originalUrl: '' },
                statusCode: 404
            };
            stream = new SendStream(res, {});

            assert.isFalse(stream.isCachable(), 'response is not cachable');
        });
        it('should return TRUE if response is cachable', function () {
            var res;
            res = {
                req: { originalUrl: '' },
                statusCode: 304
            };
            stream = new SendStream(res, {});

            assert.isTrue(stream.isCachable(), 'response is cachable');
        });
    });

    describe('#onStatError', function () {
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

    describe('#isFresh', function () {
        it('should call fresh', function () {
            var res,
                isFresh = false,
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
        });
    });

    /*
    describe.only('Test #stream', function () {
        it('should emit the expected events', function () {
            var data,
                options;

            data = 'FOO-BAR';
            options = { };
            stream.stream(data, options);
        });
    });
    */
    // type: DONE
    // setHeader : DONE

    describe('#type', function () {
        it('should do nothing if Content-Type has already been set', function () {
            var res;
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
            initResponse(res);
            stream = new SendStream(res, {});
            stream.type('/foo.html');
        });

        it('should setHeader if Content-Type has not been set', function () {
            var res;
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
            initResponse(res);
            stream = new SendStream(res, {});
            stream.type('/foo.html');
        });

    });


    describe('#setHeader', function () {
        it('should set set of headers based on fs.stat', function () {

            var res,
                stat;

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
            initResponse(res);
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

