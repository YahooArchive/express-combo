/*jslint node:true, nomen: true */

'use strict';

function StringStream(str) {
    this.data = str;
}
require('util').inherits(StringStream, require('stream'));

StringStream.prototype.open = StringStream.prototype.resume = function () {
    this.emit('data', this.data);
    this.emit('end');
    this.emit('close');
};

StringStream.prototype.pause = function () {};

StringStream.prototype.destroy = function () {
    this.data = null;
};

module.exports = StringStream;