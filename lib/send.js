/*jslint node:true, nomen: true */

/**
The `send` module was inspired by the `Send` component shipped
with Connect's middleware, and it provides a basic api to stream
static assets from a blob. Probably 80% of the code comes
from the original implementation ;) but with better format!

@module send
**/

'use strict';

var debug = require('debug')('express-combo:send'),
    parseRange = require('range-parser'),
    StringStream = require('./string'),
    mime = require('mime'),
    fresh = require('fresh'),
    http = require('http');


/**
 * Return an ETag in the form of `"<size>-<mtime>"`
 * from the given `stat`.
 *
 * @param {Object} stat
 * @return {String}
 * @private
 */
function etag(stat) {
    return '"' + stat.size + '-' + Number(stat.mtime) + '"';
}

/**
 * decodeURIComponent.
 *
 * Allows V8 to only deoptimize this fn instead of all
 * of send().
 *
 * @param {String} path
 * @private
 */
function decode(path) {
    try {
        return decodeURIComponent(path);
    } catch (err) {
        return -1;
    }
}

/**
Initialize a `SendStream` with the given `data`.

Events:

 - `error` an error occurred
 - `stream` file streaming has started
 - `end` streaming has completed

@class SendStream
@static
@uses TODO
@constructor
@param {Response} res
@param {Object} options
@protected
**/
function SendStream(res, options) {
    this.res = res;
    this.req = res.req;
    this.path = res.req.originalUrl;
    this.options = options || {};
    this.maxage(0);
}

// Inherits from `Stream`.
require('util').inherits(SendStream, require('stream'));

/**
Set max-age to `ms`.

@param {Number} ms
@return {SendStream}
**/
SendStream.prototype.maxage = function (ms) {
    if (Infinity === ms) {
        ms = 60 * 60 * 24 * 365 * 1000;
    }
    debug('max-age %d', ms);
    this._maxage = ms;
    return this;
};
/**
Emit error with `status`.

@param {Number} status
@protected
**/
SendStream.prototype.error = function (status, err) {
    var res = this.res,
        msg = http.STATUS_CODES[status];

    err = err || new Error(msg);
    err.status = status;
    if (this.listeners('error').length) {
        return this.emit('error', err);
    }
    res.statusCode = err.status;
    res.end(msg);
};

/**
Check if this is a conditional GET request.

@protected
@return {Boolean}
**/
SendStream.prototype.isConditionalGET = function () {
    return this.req.headers['if-none-match'] ||
        this.req.headers['if-modified-since'];
};

/**
Strip content-* header fields.

@protected
**/
SendStream.prototype.removeContentHeaderFields = function () {
    var res = this.res;
    Object.keys(res._headers).forEach(function (field) {
        if (0 === field.indexOf('content')) {
            res.removeHeader(field);
        }
    });
};

/**
Respond with 304 not modified.

@protected
**/
SendStream.prototype.notModified = function () {
    var res = this.res;
    debug('not modified');
    this.removeContentHeaderFields();
    res.statusCode = 304;
    res.end();
};

/**
Check if the request is cacheable, aka
responded with 2xx or 304 (see RFC 2616 section 14.2{5,6}).

@protected
@return {Boolean}
**/
SendStream.prototype.isCachable = function () {
    var res = this.res;
    return (res.statusCode >= 200 && res.statusCode < 300) ||
        304 === res.statusCode;
};

/**
Handle stat() error.

@param {Error} err
@protected
**/
SendStream.prototype.onStatError = function (err) {
    var notfound = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
    if (-1 !== notfound.indexOf(err.code)) {
        return this.error(404, err);
    }
    this.error(500, err);
};

/**
Check if the cache is fresh.

@return {Boolean}
@protected
**/
SendStream.prototype.isFresh = function () {
    return fresh(this.req.headers, this.res._headers);
};

/**
Pipe to `res.

@param {String} data
@param {Object} stat
@return {Stream} res
**/
SendStream.prototype.pipe = function (data, stat) {
    var self = this,
        path = this.path;

    // invalid request uri
    path = decode(path);
    if (-1 === path) {
        return this.error(400);
    }

    // null byte(s)
    if (-1 !== path.indexOf('\u0000')) {
        return this.error(400);
    }

    self.send(data, stat);

    return this.res;
};

/**
Transfer `path`.

@param {String} path
**/
SendStream.prototype.send = function (data, stat) {
    var options = this.options,
        len = stat.size,
        res = this.res,
        req = this.req,
        path = this.path,
        ranges = req.headers.range,
        offset = options.start || 0,
        bytes;

    // set header fields
    this.setHeader(stat);

    // set content-type
    this.type(path);

    // conditional GET support
    if (this.isConditionalGET() && this.isCachable() && this.isFresh()) {
        return this.notModified();
    }

    // adjust len to start/end options
    len = Math.max(0, len - offset);
    if (options.end !== undefined) {
        bytes = options.end - offset + 1;
        if (len > bytes) {
            len = bytes;
        }
    }

    // Range support
    if (ranges) {
        ranges = parseRange(len, ranges);

        // unsatisfiable
        if (-1 === ranges) {
            res.setHeader('Content-Range', 'bytes**/' + stat.size);
            return this.error(416);
        }

        // valid (syntactically invalid ranges are treated as a regular response)
        if (-2 !== ranges) {
            options.start = offset + ranges[0].start;
            options.end = offset + ranges[0].end;

            // Content-Range
            res.statusCode = 206;
            res.setHeader('Content-Range', 'bytes ' + ranges[0].start + '-' + ranges[0].end + '/' + len);
            len = options.end - options.start + 1;
        }
    }

    // content-length
    res.setHeader('Content-Length', len);

    // HEAD support
    if ('HEAD' === req.method) {
        return res.end();
    }

    this.stream(data, options);
};

/**
Stream `data` to the response.

@param {String} data the content to flush in the response
@param {Object} options
@protected
**/
SendStream.prototype.stream = function (data) {
    // TODO: this is all lame, refactor meeee
    var self = this,
        res = this.res,
        req = this.req,
        // pipe
        stream = new StringStream(data);

    this.emit('stream', stream);
    stream.pipe(res);

    // socket closed, done with the fd
    req.on('close', stream.destroy.bind(stream));

    // error handling code-smell
    stream.on('error', function (err) {
        // no hope in responding
        if (res._header) {
            req.destroy();
            return;
        }
        // 500
        err.status = 500;
        self.emit('error', err);
    });

    // end
    stream.on('end', function () {
        self.emit('end');
    });

    stream.resume();
};
/**
Set content-type based on `path`
if it hasn't been explicitly set.

@param {String} path
@protected
**/
SendStream.prototype.type = function (path) {
    var res = this.res,
        type,
        charset;
    if (res.getHeader('Content-Type')) {
        // do not overrule any previous content-type
        return;
    }
    type = mime.lookup(path);
    charset = mime.charsets.lookup(type);
    debug('content-type %s', type);
    res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
};

/**
Set response header fields, most
fields may be pre-defined.

@param {Object} stat
@protected
**/
SendStream.prototype.setHeader = function (stat) {
    var res = this.res;
    if (!res.getHeader('Accept-Ranges')) {
        res.setHeader('Accept-Ranges', 'bytes');
    }
    if (!res.getHeader('ETag')) {
        res.setHeader('ETag', etag(stat));
    }
    if (!res.getHeader('Date')) {
        res.setHeader('Date', new Date().toUTCString());
    }
    if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'public, max-age=' + (this._maxage / 1000));
    }
    if (!res.getHeader('Last-Modified')) {
        res.setHeader('Last-Modified', stat.mtime.toUTCString());
    }
};


module.exports = SendStream;
