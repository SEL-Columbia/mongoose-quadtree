var QuadtreeSchema = require('./models/quadtree.js');
var utils = require('./lib/utils.js');

var buildQuadtreeMethods = require('./lib/methods.js');
var buildSaveMethods = require('./lib/save.js');
var buildStaticFunctions = require('./lib/statics.js');

var models = {};
function quadtreePlugin (schema, options) {

    // assumes connection happens before plugin or something? not sure but yea..
    var mongoose = require('mongoose');
    var conn = mongoose;
    options = options || {};

    // get connection
    if (options.conn) {
        var conn = mongoose.connect(options.conn);
    } 

    if (!options.collectionName) {
        throw new Error('Must provide collection name');
    }

    // Option defaults
    options.seperation = options.seperation || 1;
    options.threshold = options.threshold || 2500;
    options.compress = options.compress || false;

    var collectionName = options.collectionName + "_quadtree";

    // avoid recompilation
    if (models[collectionName]) {
        Quadtree = models[collectionName];
    } else {
        models[collectionName] = conn.model(collectionName, QuadtreeSchema, collectionName);
        Quadtree = models[collectionName];
    }

    schema.statics.QuadtreeModel = Quadtree;
    //utils.setModel(conn.model(options.collectionName, schema, collectionName), options.collectionName);

    /* STORAGE METHODS (happen transparently) */
    buildSaveMethods(schema, options);

    /* DOCUMENT METHODS (happen on instances of a model)*/
    buildQuadtreeMethods(schema, options);

    /* SCHEMA FUNCTIONS (statics altering collection */
    buildStaticFunctions(schema, options);

}

module.exports = quadtreePlugin;
