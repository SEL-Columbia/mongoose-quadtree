//var utils = require('./utils.js');
function statics(schema, options) {
    
    var Promise = require('mongoose').Promise;

    // Eliminate all tree models
    schema.statics.wipeQuadTree = function() {
        var QuadtreeModel = this.QuadtreeModel;
        QuadtreeModel.find({}).remove(callback);
    }

    schema.statics.init = function(cb) {
        var self = this;
        var Model = self.QuadtreeModel;

        // World boundries
        var nlat = 85;
        var elng = 180;
        var slat = -85;
        var wlng = -180;

        // packaging up range query on main collection
        var findWithin = function(nlat, wlng, slat, elng) { 
            return  self.find({
                "coordinates": { //TODO replace with option
                    "$geoWithin": {
                        "$box": [
                            [wlng, slat],
                            [elng, nlat]
                        ]
                    }
                }
            });
        };


        function _createNode(nlat, wlng, slat, elng, pModel) {
            var promise = new Promise;
            
            findWithin(nlat, wlng, slat, elng).count()
                .exec(function(err, count) {
                    if (err) {
                        throw err;
                    }
        
                    // Create new node
                    var model = new Model({
                        en: [elng, nlat],
                        ws: [wlng, slat],
                        center: [(elng + wlng)/2.0, (slat + nlat)/2.0],
                        count: count,
                    });
        
                   
                    // Let Parent know about you;
                    if (pModel) {
                        Model.update(
                            {'_id': pModel}, 
                            { $push: {children: model._id}},
                            function(err, updated) {
                                if (err) throw (err);
                            }
                        );
                     }
        
        
                    if (count > (100)) {
                        // Handle children promises
                        var complete_count = 0;
                        function onComplete() {
                            complete_count++;
                            if (complete_count >= 4) { 
                                promise.fulfill();
                            }
                        };
        
                        // Save node, children will update parent with their _ids
                        model.save(function(err, model) {
                            if (err) throw (err);
        
                            // nw, ne, sw, se
                            _createNode(nlat, wlng, model.center[1], model.center[0], model._id)
                                .then(onComplete);
        
                            _createNode(nlat, model.center[0], model.center[1], elng, model._id)
                                .then(onComplete);
        
                            _createNode(model.center[1], wlng, slat, model.center[0], model._id)
                                .then(onComplete);
        
                            _createNode(model.center[1], model.center[0], slat, elng, model._id)
                                .then(onComplete);
                        });
        
                    } else if (count > 0){
                        findWithin(nlat, wlng, slat, elng).select({'_id':  1})
                            .exec(function(err, sites) {
                                if (err) throw (err);
        
                                model.uncompressedSize = 69;
                                model.compressedSize = 42;
                                model.data = sites;
                                
                                console.log("leaf @", nlat, elng, slat, wlng, count);
        
                                model.save(function(err, model) {
                                    if (err) throw (err);
                                    promise.fulfill();
                                });
        
                            });
                   } else {
                        promise.fulfill();
                   }
                });
        
            return promise;
        
        }
        

       return _createNode(nlat, wlng, slat, elng, null);
    }
};

module.exports = statics;
