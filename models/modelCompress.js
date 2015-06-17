// Model for testing purposes only
var mongoose = require('mongoose');
var quadtree = require('../mongoose-quadtree');

var Schema = mongoose.Schema;
var ModelSchema = new Schema({
    name: {
        type: String,
        required: true
        },
     coordinates: {
         type: [Number],
        },
    }
);

ModelSchema.plugin(quadtree, {
    index: true, 
    threshold: 100,
    seperation: 0.05,
    compress: true,
    //conn: 'mongodb://localhost/test', required if connection isn't explict
    collectionName: 'model_collection' 
});

var Model;

if (mongoose.models.Model) {
    Model = mongoose.model('Model');
} else {
    Model = mongoose.model('Model', ModelSchema, 'model_collection');
}

exports.Model = Model;
