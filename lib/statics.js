var utils = require('./utils.js');
function statics(schema, options) {
    
    var Promise = require('mongoose').Promise;

    // Eliminate all tree models
    schema.statics.wipeQuadTree = function() {
        var QuadtreeModel = this.QuadtreeModel;
        QuadtreeModel.find({}).remove(callback);
    }

    schema.statics.root = function(callback) {
        // Theres only ever one element that can be the root;
        var self = this;
        self.QuadtreeModel.findOne({isRoot: true}).exec(callback);
    }

    schema.statics.initTree = function(forceRebuild) {
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

        self.QuadtreeModel.findWithin = findWithin; //XXX temp hack



        function _createNode(nlat, wlng, slat, elng, pModel, pos) {
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
                        sep: Math.abs(wlng - elng),
                        count: count,
                    });
        
                    // Let Parent know about you;
                    if (pModel) {
                        child = {}; 
                        child["children." + pos]  =  model._id; // Is this guranteed to be kept accurate?

                        Model.update(
                            {'_id': pModel}, 
                            child,
                            function(err, updated) {
                                if (err) throw (err);
                            }
                        );
                     } else {
                         // Has to be root if it has no parents
                         model.isRoot = true;
                     }
        
        
                    if ((count > (options.threshold || 2500)) && (model.sep > (options.seperation || 1))) {
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
                            _createNode(nlat, wlng, model.center[1], model.center[0], model._id, 'wn')
                                .then(onComplete);
        
                            _createNode(nlat, model.center[0], model.center[1], elng, model._id, 'en')
                                .then(onComplete);
        
                            _createNode(model.center[1], wlng, slat, model.center[0], model._id, 'ws')
                                .then(onComplete);
        
                            _createNode(model.center[1], model.center[0], slat, elng, model._id, 'es')
                                .then(onComplete);
                        });

                       // console.log("parent @", nlat, elng, slat, wlng, count);
        
                    } else if (count > 0){
                        findWithin(nlat, wlng, slat, elng)
                            .exec(function(err, sites) {
                                if (err) throw (err);

                                model.data = sites;
                                model.isLeaf = true;

                                //console.log("leaf @", nlat, elng, slat, wlng, count, model._id);
                                model.save(function(err, model) {
                                    if (err) throw (err);
                                    promise.fulfill();
                                });
        
                            });
                   } else {
                       model.isLeaf = true;
                       model.save(function(err, model) {
                           if (err) throw (err);
                           promise.fulfill();
                       });
                   }
                });
        
            return promise;
        }
        
        forceRebuild = forceRebuild || false;
        var p = new Promise;

        self.QuadtreeModel.find({isRoot: true}).count().exec(function(err, count) { 
            if (err) throw (err);
            
            if (count == 1 && !forceRebuild) {
                p.fulfill();
                return;
            }

            //XXX Wipe db if forceRebuild
            _createNode(nlat, wlng, slat, elng, null)
                .then(function() { p.fulfill() });

        });

        return p;


    }
};

module.exports = statics;
