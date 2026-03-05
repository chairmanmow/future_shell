"use strict";
print('In loaded file with strict mode:');
print('typeof this: ' + typeof this);
print('typeof global: ' + typeof global);
print('typeof globalThis: ' + typeof globalThis);

var extend = function(Sub, Super) {
    Sub.prototype = Object.create(Super.prototype);
    Sub.prototype.constructor = Sub;
};
print('extend defined: ' + typeof extend);
if (typeof this !== 'undefined') this.extend = extend;
if (typeof global !== 'undefined') global.extend = extend;
print('After export attempt, checking if extend is accessible globally...');
