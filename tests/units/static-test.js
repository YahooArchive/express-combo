/*
* Copyright (c) 2013, Yahoo! Inc. All rights reserved.
* Copyrights licensed under the New BSD License.
* See the accompanying LICENSE file for terms.
*/

/*jslint node:true, nomen:true*/

var YUITest = require('yuitest'),
    A = YUITest.Assert,
    OA = YUITest.ObjectAssert,
    suite,
    libstatic = require('../../lib/static.js');

suite = new YUITest.TestSuite("yui-test suite");

suite.add(new YUITest.TestCase({
    name: "yui-test",

    "test constructor": function () {
        A.isNotNull(libstatic, "static module require failed");
    }

}));

YUITest.TestRunner.add(suite);
