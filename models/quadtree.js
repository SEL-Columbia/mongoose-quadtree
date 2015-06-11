var mongoose = require('mongoose');
var Document = mongoose.Document;

var Schema = mongoose.Schema;
//var collectionName = '_quadtree';
var Anything = mongoose.Schema.Types.Mixed;
var ObjectID = Schema.Types.ObjectId;

var QuadtreeSchema = new Schema({
    data: {
        //XXX: Consider making this a sub document
        type: Anything,
    },

    en: {
        type: [Number],
        required: true,
        index: '2d',
    },

    ws: {
        type: [Number],
        required: true,
        index: '2d',
    },

    center: {
        type: [Number],
        required: true,
    },

    count: {
        type: Number,
        required: true,
    },

    isRoot: {
        type: Boolean,
        default: false
    },

    children: { 
        wn: String,
        en: String,
        ws: String,
        es: String

    }
});

module.exports = QuadtreeSchema;
