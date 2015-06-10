//var utils = require('./utils.js');
var assert = require('assert');
var ObjectId = require('mongoose').Types.ObjectId;

function save(schema, options) {
    var QuadtreeModel = schema.statics.QuadtreeModel;

    schema.pre('update', true, function(next, done) {
        //TODO: If coordinates change, what happens to data?
    });

    schema.pre('remove', true, function(next, done) {
        next();
        done();
    });

    schema.post('save', function(doc) {
        console.log('save', doc);
    });
}

module.exports = save;
