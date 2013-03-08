/*
 * Copyright (c) 2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

/*jslint node:true, nomen: true */

/**
The `yui.static` middleware provides a set of features
to serve modules and assets in a form of static express
and connect assets as well as serving them combined by
using the combohandler technique.

@module yui
@submodule static
**/

'use strict';

var express = require('express'),
    libfs   = require('fs'),
    libpath = require('path'),
    libutil = require('util');

// BadRequest is used for all filesystem-related errors, including when a
// requested file can't be found (a NotFound error wouldn't be appropriate in
// that case since the route itself exists; it's the request that's at fault).
function BadRequest(message) {
    Error.call(this);
    this.name = 'BadRequest';
    this.message = message;
    Error.captureStackTrace(this, BadRequest);
}
libutil.inherits(BadRequest, Error);

function dedupe(array) {
    var hash    = {},
        results = [],
        hasOwn  = Object.prototype.hasOwnProperty,
        i,
        item,
        len;

    for (i = 0, len = array.length; i < len; i += 1) {
        item = array[i];

        if (!hasOwn.call(hash, item)) {
            hash[item] = 1;
            results.push(item);
        }
    }

    return results;
}

/**
The `static` provides capabilities to serve static and combined
YUI modules and assets, as well as the ability to map paths and
protect folders by exposing those files that are part of the
mapping configuration only.

    var middleware = require('./yui/lib/static');

    // serving static files from a public folder where
    // all files will be exposed.
    app.get('/static/', middleware.static(__dirname + '/static/', {
        maxAge: 31536000
    });

    // serving static files from a public folder where
    // all files will be exposed.
    app.get('/other/', middleware.static(__dirname, {
        map: {
            "assets/something.js": __dirname + "/foo/bar.js"
        }
    });

This component also provide combohandler capabilities, and it is
inspired on the `combohandler` npm pkg, but it focus on the
ability to map paths and define groups for maps.

    // Creates a new express app.
    app.get('/foo', middleware.combine(__dirname, {
        maxAge: 31536000,
        map: {
            yui: {
                path: __dirname + "/yui/build/",
                root: 'yui/'
            },
            app: {
                root: 'app/',
                map: {
                    "assets/something.js": __dirname + "/foo/bar.js"
                }
            }
        }
    });

@class static
@static
@uses *express, *fs, *path, *util
*/
module.exports = {

    /**
    Adds a group of modules into the internal cache structure
    that will be used to map public paths with filesystem paths
    as well as module names with groups and partial paths. This
    mapping will be used by the seed generator and the static
    handlers.

    @method _registerGroup
    @private
    @param {Object} group
    **/
    _registerGroup: function (group) {
        this._groups = this._groups || [];
        this._groups.push(group);
    },

    sendAssetToSocket: function (res, data, config) {

        // TODO: validate etag
        // TODO: validata data and config

        config = config || {};

        var maxAge = config.maxAge,
            lastModified = new Date(data.stats.mtime);

        if (typeof maxAge === 'undefined') {
            // default cache is one year
            maxAge = 31536000;
        }

        if (lastModified) {
            res.header('Last-Modified', lastModified.toUTCString());
        }

        // http://code.google.com/speed/page-speed/docs/caching.html
        if (maxAge !== null) {
            res.header('Cache-Control', 'public,max-age=' + maxAge);
            res.header('Expires', new Date(Date.now() + (maxAge * 1000)).toUTCString());
        }

        res.header('Content-Type', this.getContentType(data.url));
        res.body = data.body;

        res.send(res.body);

    },

    getAssetFromFS: function (absolutePath, callback) {

        // Bubble up an error if the request fails to
        // normalize the path.
        if (!absolutePath) {
            return callback(new Error('File not found: ' + absolutePath));
        }

        // TODO: try/catch

        libfs.stat(absolutePath, function (err, stats) {

            if (err || !stats.isFile()) {
                return callback(new Error('File not found: ' + absolutePath));
            }

            libfs.readFile(absolutePath, 'utf8', function (err, data) {

                if (err) {
                    return callback(new Error('Error reading file: ' + absolutePath));
                }

                callback(null, {
                    body: data,
                    stats: stats
                });

            }); // fs.readFile

        }); // fs.stat

    },

    getContentType: function (url) {
        var mime = express['static'].mime,
            ext,
            mt,
            cs;

        ext = libpath.extname(url).toLowerCase();
        // removing the . when posible
        ext = ext.indexOf('.') === 0 ? ext.slice(1) : ext;
        // computing mime type based on the extension
        mt = (ext && mime.types[ext]) || 'text/plain';
        // computing charset based on the mime type
        cs = mime.charsets.lookup(mt, 'UTF-8');

        return (mt + ';charset=' + cs).toLowerCase();
    },

    getGroupFromURL: function (url) {
        var groups = this._groups,
            group,
            i;

        if (url) {
            for (i in groups) {
                if (groups.hasOwnProperty(i) &&
                        (url.indexOf(groups[i].prefix) === 0)) {

                    // TODO: apply extra filters from matching group

                    return groups[i];

                }
            }
        }
    },

    /**
    Only expose a set of files within a directory while keeping the rest of
    the files way from public access.

    The `mapping` object is of the folloing form:
        { public-path: absolute-path-to-resource, .. }

    e.g.
    All the files in __dirname + '/htdocs/protected/' are not accessible
    publicly except for the 2 defined resources.

        app.use('/protected', statichandler.map({
            "one.html": __dirname + "/htdocs/protected/one.html",
            "assets/style.css": __dirname + "/htdocs/protected/assets/style.css"
        });

    @param {Object} map
    @return {Function} express static middleware
    **/
    map: function (groupName, urls, config) {

        config = config || {};
        urls = urls || {};

        // TODO: validate groupName

        var prefix = '/' + groupName + '/',
            my = this;

        this._registerGroup({
            prefix: prefix,
            urls: urls,
            config: config
        });

        return function (req, res, next) {

            // valid urls are only those that matches prefix
            var url = req.url.indexOf(prefix) === 0 && req.url.slice(prefix.length);

            if (url && urls[url]) {

                if ('GET' !== req.method && 'HEAD' !== req.method) {
                    return next(new BadRequest('Invalid method to access static assets.'));
                }

                my.getAssetFromFS(libpath.join(config.root || '', urls[url]), function (err, data) {

                    if (err) {
                        return next(new BadRequest('Error reading file: ' + req.url));
                    }

                    my.sendAssetToSocket(res, {
                        body : data.body,
                        url  : url,
                        stats: data.stats
                    }, config);

                });

            } else {
                next();
            }

        };

    },

    /**
    Serves static modules and assets based on the rootPath if
    `config.map` is not present. If the `config.map` is set,
    it will force all requests to be mapped to protect
    the rest of the file under the folder designed by `rootPath`.
    This method uses `express.static` under the hood, and
    configurations will be hand over to that middleware.

    @method static
    @public
    @param {String} rootPath The path to the folder that should
    be exposed.
    @param {Object} config the static handler configuration for
    `express.static`.

        @param {Object} config.urls optional hash table with the
        public url mapping the filesystem path per file.

    @return {function} express static middlewares
    **/
    folder: function (groupName, rootPath, config) {

        // TODO: validation
        config = config || {};

        var prefix = '/' + groupName + '/',
            middleware;

        this._registerGroup({
            prefix: prefix,
            rootPath: rootPath,
            config: config
        });

        rootPath = libpath.join(config.root || '', rootPath || '');
        middleware = express['static'](rootPath, config);

        return function (req, res, next) {

            // valid urls are only those that matches prefix
            var url = req.url.indexOf(prefix) === 0 && req.url.slice(prefix.length);

            if (url) {

                if ('GET' !== req.method && 'HEAD' !== req.method) {
                    return next(new BadRequest('Invalid method to access static assets.'));
                }
                req.url = url;
                middleware(req, res, next);

            } else {
                next();
            }

        };

    },

    /**
    Serves combined modules and assets based on the mapping.

    @method combine
    @public
    @param {String} rootPath in case a group in the map does
    not include the member `path`, this value will be the fallback
    @param {Object} config the static handler configuration

        @param {Object} config.map the map configuration per group

            @param {String} config.map.prefix matching prefix to identify
            if a required file belongs to the group.
            @param {String} config.map.path optional filesystem path used
            as the root folder when exposing everything as part of the group.
            This value fallbacks to `rootPath` argument, and for groups with
            `config.map.urls` set, this value is complete irrelevant and the
            mapping will be forced.
            @param {Object} config.map.urls optional hash table with the
            public url mapping the filesystem path per file.

        @param {Number} config.maxAge optional number of seconds to
        cache the combo url. By default 1 year.
        @param {Object} config.mimeTypes optional mapping between
        file extensions and response header for content-type.

    @return {function} express static middlewares
    **/
    combine: function (config) {

        config = config || {};

        var groups    = this._groups,
            comboSep  = config.comboSep || '~',
            comboBase = config.comboBase || '',
            my        = this;

        function normalize(url) {

            var group = my.getGroupFromURL(url);

            if (group) {

                url = url.slice(group.prefix.length);

                if (group.urls) {
                    // we need to force mapping
                    if (group.urls[url]) {
                        return libpath.join((group.config.root || ''),
                            group.urls[url]);
                    }
                } else {
                    // we need to rely on the filesystem, no mapping
                    // is needed for this group.
                    url = libpath.join(group.config.root || '',
                        group.rootPath, url);
                    if (url.indexOf(libpath.join(group.config.root || '',
                        group.rootPath)) === 0) {
                        // If the path is controlled, which means the url is
                        // not attempting to traverse above the root path, we
                        // are good to go.
                        return url;
                    }
                }

            }

        }

        return function (req, res, next) {

            var body = [],
                urls = [],
                pending,
                fileTypes,
                type,
                lastModified;

            if (req.url && req.url.indexOf(comboBase) === 0) {
                urls = req.url.slice(comboBase.length).split(comboSep);
            } else {
                return next();
            }

            pending = urls.length;

            if ('GET' !== req.method && 'HEAD' !== req.method) {
                return next(new BadRequest('Invalid method.'));
            }

            if (!pending) {
                return next(new BadRequest('No files requested.'));
            }

            if (dedupe(urls.map(function (url) {
                    return my.getContentType(url);
                })).length !== 1) {
                return next(new BadRequest('Mixing content-types in combo request: ' + req.url));
            }

            urls.forEach(function (url, i) {

                my.getAssetFromFS(normalize(url), function (err, data) {

                    if (err) {
                        return next(new BadRequest('Error reading file: ' + url));
                    }

                    var mtime = new Date(data.stats.mtime);

                    if (!lastModified || mtime > lastModified) {
                        lastModified = mtime;
                    }

                    body[i]  = data.body.toString();
                    pending -= 1;

                    if (pending === 0) {

                        my.sendAssetToSocket(res, {
                            body : body.join(''),
                            url  : url,
                            stats: {
                                mtime: lastModified
                            }
                        }, config);

                    }

                });

            });

        };

    }

};
