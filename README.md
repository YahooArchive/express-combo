modown-static
=============

modown static and combo handler

## Goals

 * register and serve static assets from a specific folder
 * register and serve static assets based on an explicit mapping to protect other files that should not be exposed
 * serve combo urls based on the static assets that were registered
 * support custom filters (regex) to include and/or exclude assets

## Usage as stand alone middleware for express

```
var statichandler = require('modown-static');
app.use('/public/',    statichandler.public('full/path/to/folder/'));
app.use('/protected/', statichandler.map({
    "something/foo.js": "full/path/to/something/foo.js",
    "bar.js": "full/path/to/something/bar.js"
}));
app.use(statichandler.combine({
    comboBase: "/combo~",
    comboSep: "~"
}));
```

The example above will allow you to access any file within the folder
`full/path/to/folder/` by following the route `http://hostname:port/public/whatever/file.js`
without any protection, which means all files could be accessed. Under
the hood this is equivalent to use `express.static` middleware.

It also expose two files from another folder `full/path/to/root/folder/`,
those files could be accesed thru `http://hostname:port/protected/something/foo.js`
and `http://hostname:port/protected/bar.js`, and it protects any other file within
the root folder. It also provides a nice abstraction where filenames and paths in
the filesystem are not longer relevant when it comes to serve them, and the mapping
has to be explicit.

And last, but not least, it turns on the combo capabilities for all the previous
registered assets, and doing so by defining the `path` to the combo, and the
separator token. As a result, a urls like these will be valid:

  * http://hostname:port/combo~something/foo.js~bar.js
  * http://hostname:port/combo~whatever/file.js~something/foo.js~bar.js

## Usage as a modown plugin

```
modown.plug(require('modown-static'));
app.use('/public/',    modown.static.public('full/path/to/folder/'));
app.use('/protected/', modown.static.map({
    "something/foo.js": "full/path/to/something/foo.js",
    "bar.js": "full/path/to/something/bar.js"
}));
app.use(modown.static.combine({
    comboBase: "/combo~",
    comboSep: "~"
}));
```

## How to contribute

See the [CONTRIBUTE.md](CONTRIBUTE.md) file for info.
