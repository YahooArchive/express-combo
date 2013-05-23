Express Combo
=============

Combo handler for express applications

## Goals

 * register and serve static assets from a specific folder
 * register and serve static assets based on an explicit mapping to protect other
   files that should not be exposed
 * serve combo urls based on the static assets that were registered

Installation
------------

Install using npm:

```shell
$ npm install express-combo
```

Usage
-----

```
var express = require('express'),
    app = express(),
    statichandler = require('express-combo');

app.get('/static', statichandler.folder('public', 'full/path/to/folder/'));

app.get('/static', statichandler.map('protected', {
    'something/foo.js": "full/path/to/something/foo.js',
    'bar.js": "full/path/to/something/bar.js'
}));

app.get('/static', statichandler.combine({
    comboBase: '/combo~',
    comboSep: '~'
}));
```

The example above will allow you to access any file within the folder
`full/path/to/folder/` by following the route:

 * http://hostname:port/static/public/any/file.js

In this case, serving files without any protection, which means all files could be
accessed. Under the hood this is equivalent to use `express.static` middleware.
It also expose two files, but this time adding some explicit mapping for them, exposing:

 * http://hostname:port/static/protected/something/foo.js
 * http://hostname:port/static/protected/bar.js

It protects any other file within the those folders. It also provides a nice abstraction
where filenames and paths in the filesystem are not longer relevant when it comes to serve
them, and the mapping has to be explicit.

And last, but not least, it turns on the combo capabilities for all the previous
registered assets, and doing so by defining the separator token. As a result,
a urls like these will be valid:

 * http://hostname:port/static/combo~something/foo.js~bar.js
 * http://hostname:port/static/combo~any/file.js~something/foo.js~bar.js

_Note: the `/static` prefix is optional, and you can remove it all together, and even
use `app.use()` directly for those middleware._

TODO
----

 * support custom filters (regex) to include and/or exclude assets thru `folder` and `map`.
 * css relative path correction when serving thru combo

License
-------

This software is free to use under the Yahoo! Inc. BSD license.
See the [LICENSE file][] for license text and copyright information.

[LICENSE file]: https://github.com/yahoo/express-combo/blob/master/LICENSE.md

Contribute
----------

See the [CONTRIBUTE file][] for info.

[CONTRIBUTE file]: https://github.com/yahoo/express-combo/blob/master/CONTRIBUTE.md
