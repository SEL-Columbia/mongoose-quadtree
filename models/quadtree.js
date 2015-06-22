var mongoose = require('mongoose');
var Document = mongoose.Document;

var Schema = mongoose.Schema;
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

    compressedSize: {
        type: Number,
        default: 0,
    },

    uncompressedSize: {
        type: Number,
        default: 0,
    },

    sep: {
        type: Number,
        required: true,
    },

    isRoot: {
        type: Boolean,
        default: false
    },

    isLeaf: {
        type: Boolean,
        default: false
    },

    children: { 
        wn: Anything,
        en: Anything,
        ws: Anything,
        es: Anything

    }
    },
    {
        id: false,
        versionKey: false

    });

module.exports = QuadtreeSchema;
