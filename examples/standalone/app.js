/*jslint node:true, nomen: true*/

'use strict';

var libpath        = require('path'),
    express        = require('express'),
    exphbs         = require('express3-handlebars'),
    statichandler  = require('../../'),
    app            = express(),
    appRootPath    = __dirname;


app.configure('development', function () {
});

app.configure('production', function () {
});

// setup public folders
// test urls:
// /public/one.html => $root/htdocs/public/one.html
// /public/assets/style.css => $root/htdocs/public/assets/style.css
app.use('/public', statichandler.share(libpath.join(appRootPath, 'htdocs', 'public')));

// setup "protected" folders by providing a specific mapping.
// "protected" does not mean "access control", but only exposing a limited
// number of files without opening the entire directory to "public".
// .e.g. application can use a "resolver" to get that metadata generated.
app.use('/protected', statichandler.map({
    "/two.html": libpath.join(appRootPath, 'htdocs', 'protected', 'two.html'),
    "/assets/style.css": libpath.join(appRootPath, 'htdocs', 'protected', 'assets', 'style.css')
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
