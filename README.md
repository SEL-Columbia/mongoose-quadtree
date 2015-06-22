Mongoose Quadtree 
=========================

[![Build Status](https://travis-ci.org/SEL-Columbia/mongoose-quadtree.svg?branch=master)](https://travis-ci.org/SEL-Columbia/mongoose-quadtree)

## Overview
Mongoose-quadtree adds quadtree abilities to a model that has an appropiate lat/lng coordinates field. Think of it as an index.

This plugin is designed to return spatial data in an organized and compressed manner. Leverging LZ-String, data can be compressed and queried and a very efficent manner. 

The api returns all model data contained in the quadtree indexes leaf nodes
that intersect with the specified lat/lng bounds. The data can be returned compressed (which is recommended), use LZString to decompress the data. The data is compressed in a format compatiable with localStorage (i.e packs data into uint16 bits)

All API methods return mongoose promises!

![alt tag](https://raw.github.com/SEL-Columbia/mongoose-quadtree/master/example-index.png)

## How to use

### Initilization

The first step is to include the plugin, below is an example setup.

```javascript
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
```

collectionName is a REQUIRED field.

The next step is to initilize the tree. Call this function somewhere after making a connection

```javascript
var forceRebuild = true;
var Promise = Model.initTree(forceRebuild);
Promise.onResolve(function(err) {
    console.log("Tree built");
});
```

You have the option of always rebuilding the tree or not. I recommend keeping this active for now. Building takes a minute. You can wait on the build using the returned mongoose promise.


### Querying
```javascript
Model.findSubtree({'en': [7, 14], 'ws': [6, 12]})
    .onResolve(function(err, tree) {
        // Returns a quadtree with leaf nodes intersected by specified bounds
        console.log(tree);
    });

Model.findNodes({'en': [7, 14], 'ws': [6, 12]})
    .onResolve(function(err, nodes) {
        // Returns leaf nodes intersected by specified bounds
        console.log(nodes);
    });
```

Query the quadtree as shown above. These static methods return promises that will be fulfilled. Data in leaf nodes will be compressed using LZString.compressToUTF16.

Leaf node data is ALWAYS an array (one element array in compressed case)

### Updating
Updates happen transparently on save and remove calls ;) Don't even worry about it.

### Status
In development, it is safe to use now mostly, but I'd recommend rebuilding the index nightly.

### TODO
Hook into mongo update calls, currently only save, remove are listened 
Benchmarks?

