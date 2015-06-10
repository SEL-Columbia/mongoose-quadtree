/* Utility functions */

module.exports = (function() {
    this.models = {}; // Keeping track of what I've returned so far
    this.isOnlyDocument = function(docs) {
        if (docs !== null && docs.length == 1) {
            return true;
        }
        return false;
    }

    this.getQuadtreeModel = function(model, schema, options) {
        var conn;
        if (options && options.conn) {
            conn = mongoose.connect(options.conn);
        } else {
            conn = model.constructor.collection.conn; 
        }

        var collection;
        if (options && options.collectionName) {
            collection = options.collectionName;
        } else {
            collection = model.constructor.collection.name;
        }


        var modelName = model.constructor.modelName;
        var quadtreeName = 'Quadtree_'+modelName;
        console.log(modelName);
        console.log(collection);

        if (!models[quadtreeName]) {
            models[quadtreeName] = conn.model(quadtreeName, 
                    QuadtreeSchema, collectionName);

            schema.statics.QuadtreeModel = models[quadtreeName];
        }

        return models[quadtreeName];

    }

    return this;
})();




