/*jslint node:true, nomen: true*/

'use strict';

var libpath        = require('path'),
    express        = require('express'),
    exphbs         = require('express3-handlebars'),
    statichandler  = require('../../'),
    app            = express(),
    appRootPath    = __dirname;

// setup public folders
// test urls:
// /foo/bar/one.js           => $root/htdocs/public/one.js
// /foo/bar/assets/style.css => $root/htdocs/public/assets/style.css
app.use('/foo', statichandler.folder('bar', '/public', {
    // maxAge: 123,
    root: libpath.join(appRootPath, 'htdocs')
}));

// setup "protected" files by providing a specific mapping.
// "protected" does not mean "access control", but only exposing a limited
// number of files without serving the entire directory.
// .e.g. application can use a "resolver" to get that metadata generated.
// test urls:
// /baz/qux/another/two.js => $root/htdocs/protected/two.js
// /baz/qux/also/style.css => $root/htdocs/protected/assets/style.css
app.use('/baz', statichandler.map('qux', {
    "another/two.js": libpath.join('protected', 'two.js'),
    "also/style.css": libpath.join('protected', 'assets', 'style.css')
}, {
    // maxAge: 123,
    root: libpath.join(appRootPath, 'htdocs')
}));

app.use(statichandler.combine({
    comboBase: '/combo~',
    comboSep: '~'
    // maxAge: 123
}));

// template engine
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

// creating a page with YUI embeded
app.get('/', function (req, res, next) {
    res.render('page');
});

// listening
app.set('port', process.env.PORT || 8666);
app.listen(app.get('port'), function () {
    console.log("Server listening on port " +
        app.get('port') + " in " + app.get('env') + " mode");
});
