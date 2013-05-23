/*
 * Copyright (c) 2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

/*jslint node:true, nomen: true */

/**
The `static` middleware provides a set of features
to serve files (static assets), as well as serving
them combined by using the combohandler technique.

@module static
**/

'use strict';

var debug   = require('debug')('express-combo:static'),
    express = require('express'),
    libfs   = require('fs'),
    libpath = require('path'),
    libmime = require('mime'),
    SendStream = require('./send');

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

    var middleware = require('express-combo');

    // serving static files from a public folder where
    // all files will be exposed.
    app.get('/static/', middleware.folder(__dirname + '/static/', {
        maxAge: 31536000
    });

    // serving static files from a public folder where
    // all files will be exposed.
    app.get('/other/', middleware.map(__dirname, {
        "assets/something.js": __dirname + "/foo/bar.js"
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

    /**
    Given an absolutePath to a file, read the contents and return the stats.

    The `data` object return via the callback is of the form:
    <dl>
      <dt>data.body</dt>
        <dd>The `Buffer` instance which represents the contents of the file.</dd>
      <dt>data.stat</dt>
        <dd>The `stat` object for `fs.stat`.</dd>
    </dl>
    @method getAssetFromFS
    @protected
    @param {String} absolutePath 
    @param {Function} callback callback(err, data)
      @param {Error|String} err
      @param {Object} data
    **/
    getAssetFromFS: function (absolutePath, callback) {

        // Bubble up an error if the request fails to
        // normalize the path.
        if (!absolutePath) {
            return callback(new Error('File not found: ' + absolutePath));
        }

        // TODO: try/catch

        libfs.stat(absolutePath, function (err, stat) {

            if (err || !stat.isFile()) {
                return callback(new Error('File not found: ' + absolutePath));
            }

            libfs.readFile(absolutePath, function (err, data) {

                if (err) {
                    return callback(new Error('Error reading file: ' + absolutePath));
                }
                callback(null, {
                    body: data,
                    stat: stat
                });

            }); // fs.readFile

        }); // fs.stat

    },

    getContentType: function (url) {
        var ext,
            mt,
            cs;

        ext = libpath.extname(url).toLowerCase();
        // removing the . when posible
        ext = ext.indexOf('.') === 0 ? ext.slice(1) : ext;
        // computing mime type based on the extension
        mt = (ext && libmime.types[ext]) || 'text/plain';
        // computing charset based on the mime type
        cs = libmime.charsets.lookup(mt, 'UTF-8');

        return (mt + ';charset=' + cs).toLowerCase();
    },

    getGroupFromURL: function (url) {
        var groups = this._groups,
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

    @method map
    @public
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

        debug('serving static map thru %d', prefix);

        return function (req, res, next) {

            // valid urls are only those that matches prefix
            var url = req.url.indexOf(prefix) === 0 && req.url.slice(prefix.length),
                stream;

            if (url && urls[url]) {

                stream = new SendStream(res, config);
                stream.maxage(config.maxAge || 0);
                stream.on('error', function (err) {
                    next(err);
                });

                if ('GET' !== req.method && 'HEAD' !== req.method) {
                    return next();
                }

                my.getAssetFromFS(libpath.join(config.root || '', urls[url]), function (err, data) {
                    if (err) {
                        return stream.onStatError(err);
                    }
                    stream.pipe(data.body, data.stat);
                });

            } else {
                next();
            }

        };

    },

    /**
    Serves static modules and assets based on the rootPath.
    This method uses `express.static` under the hood, and
    configurations will be hand over to that middleware.

    @method folder
    @public
    @param {String} groupName the name of the group to associate this
    folder mapping
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

        debug('serving static folder %d', rootPath);

        return function (req, res, next) {

            // valid urls are only those that matches prefix
            var url = req.url.indexOf(prefix) === 0 && req.url.slice(prefix.length);

            if (url) {

                if ('GET' !== req.method && 'HEAD' !== req.method) {
                    return next();
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
    @param {Object} config the static handler configuration
        @param {String} config.comboBase optional if not specified, default to ``
        @param {String} config.comboSep optional if not specified, default to `~`
        @param {Number} config.maxAge optional number of seconds to
        cache the combo url. By default 1 year.
        @param {Object} config.mimeTypes optional mapping between
        file extensions and response header for content-type.

    @return {function} express static middlewares
    **/
    combine: function (config) {

        config = config || {};

        var comboSep  = config.comboSep || '~',
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

        debug('enabling combo thru %d', comboBase);

        return function (req, res, next) {

            var body = [],
                urls = [],
                pending,
                newestStat,
                stream;

            if (req.url && req.url.indexOf(comboBase) === 0) {
                urls = req.url.slice(comboBase.length).split(comboSep);
            } else {
                return next();
            }

            pending = urls.length;

            if ('GET' !== req.method && 'HEAD' !== req.method) {
                return next();
            }

            stream = new SendStream(res, config);
            stream.maxage(config.maxAge || 0);
            stream.on('error', function (err) {
                next(err);
            });

            if (!pending) {
                return stream.error(404, new Error('No files requested.'));
            }

            if (dedupe(urls.map(function (url) {
                    return my.getContentType(url);
                })).length !== 1) {
                return stream.error(404, new Error('Mixing content-types in combo request.'));
            }

            urls.forEach(function (url, i) {

                my.getAssetFromFS(normalize(url), function (err, data) {

                    var blob,
                        len,
                        j;

                    if (err) {
                        return stream.onStatError(err);
                    }

                    data.stat.lastModified = new Date(data.stat.mtime);

                    // TODO: validate that this statement is correct
                    // where the newest file should win
                    if (!newestStat || newestStat.lastModified < data.stat.lastModified) {
                        newestStat = data.stat;
                    }

                    body[i]  = data.body; // storing buffers before combine them
                    pending -= 1;

                    if (pending === 0) {

                        // first pass computes total length, so we can make a
                        // buffer of the correct size
                        len = 0;
                        for (j = 0; j < body.length; j += 1) {
                            len += body[j].length;
                        }
                        newestStat.size = len;
                        blob = new Buffer(len);

                        // second pass to actually fill the buffer
                        len = 0;
                        for (j = 0; j < body.length; j += 1) {
                            body[j].copy(blob, len);
                            len += body[j].length;
                        }

                        stream.pipe(blob.toString(), newestStat);
                    }

                });
            });
        };
    }
};
