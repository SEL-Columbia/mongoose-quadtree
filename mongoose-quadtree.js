var QuadtreeSchema = require('./models/quadtree.js');
var buildQuadtreeMethods = require('./lib/methods.js');
var buildSaveMethods = require('./lib/save.js');
var buildStaticFunctions = require('./lib/statics.js');
var models = {};
function quadtreePlugin (schema, options) {

    /* SCHEMA CHANGES */
    var collectionName = options.collectionName + "_quadtree";
    var Quadtree;

    // assumes connection happens before plugin or something? not sure but yea..
    var mongoose = require('mongoose');
    var conn = mongoose;

    // get connection
    if (options && options.conn) {
        var conn = mongoose.connect(options.conn);
    } 

    // avoid recompilation
    if (models[collectionName]) {
        Quadtree = models[collectionName];
    } else {
        models[collectionName] = conn.model(collectionName, QuadtreeSchema, collectionName);
        Quadtree = models[collectionName];
    }

    schema.statics.QuadtreeModel = Quadtree;

    /* STORAGE METHODS (happen transparently) */
    buildSaveMethods(schema, options);

    /* DOCUMENT METHODS (happen on instances of a model)*/
    buildQuadtreeMethods(schema, options);

    /* SCHEMA FUNCTIONS (statics altering collection */
    buildStaticFunctions(schema, options);

}

module.exports = quadtreePlugin;
