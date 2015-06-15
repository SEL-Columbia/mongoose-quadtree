var utils = require('./utils.js');
function statics(schema, options) {
    var Promise = require('mongoose').Promise;

    // Eliminate all tree models
    schema.statics.wipeQuadTree = function(callback) {
        var QuadtreeModel = this.QuadtreeModel;
        if (callback) {
            QuadtreeModel.find({}).remove(callback);
        } else {
            QuadtreeModel.find({}).remove();
        }
    }

    schema.statics.root = function(callback) {
        // Theres only ever one element that can be the root;
        var self = this;
        self.QuadtreeModel.findOne({isRoot: true}).exec(callback);
    }

    schema.statics.initTree = function(forceRebuild) {
        var self = this;
        var Model = self.QuadtreeModel;
        //XXX Find way to get model ahead of init call
        utils.setModel(self, options.collectionName);

        // World boundries
        var nlat = 85;
        var elng = 180;
        var slat = -85;
        var wlng = -180;

        // packaging up range query on main collection
        var findWithin = utils.within(options.collectionName);

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

            if (forceRebuild) {
                self.wipeQuadTree(function(err, sites) {
                    if (err) throw (err);
                    _createNode(nlat, wlng, slat, elng, null)
                    .then(function() { p.fulfill() });
                });

                return;
            }

            _createNode(nlat, wlng, slat, elng, null)
                .then(function() { p.fulfill() });

        });

        return p;

    }

    schema.statics.findNode = function(bounds) {
        var self = this;
        var Model = self.QuadtreeModel;

        var withinNode = function(tree, bounds, dir) {
            //                en[0,1]
            //       _________
            //      |         |
            //      |         |
            //      | c[0,1]  |
            //      |         |
            //      |_________|
            //
            // ws[0, 1]
            //
            //    self.nw = new facilityNode(self.nlat, self.wlng, self.center.lat, self.center.lng);
            //    self.ne = new facilityNode(self.nlat, self.center.lng, self.center.lat, self.elng);
            //    self.sw = new facilityNode(self.center.lat, self.wlng, self.slat, self.center.lng);
            //    self.se = new facilityNode(self.center.lat, self.center.lng, self.slat, self.elng);
            
            
            switch(dir) {
                case 'wn':
                    // nw, center //en[1] sw[0]
                    if ((tree.en[1] < bounds.en[1] || tree.center[0] < bounds.en[0])  
                       || (tree.center[1] > bounds.ws[1] || tree.sw[0] > bounds.ws[0])) {
                        return false;
                    }

                    return true;

                case 'en':
                    // ne, center //en[1] en[0]
                    if ((tree.en[1] < bounds.en[1] || tree.en[0] < bounds.en[0])
                       || (tree.center[1] > bounds.ws[1] || tree.center[0] > bounds.ws[0])) {
                        return false;
                    }

                    return true;

                case 'ws':
                    // ws, center //ws[1] ws[0]
                    if ((tree.center[1] < bounds.en[1] || tree.center[0] < bounds.en[0])
                       || (tree.ws[1] > bounds.ws[1] || tree.ws[0] > bounds.ws[0])) {
                        return false;
                    }

                    return true;

                case 'es':
                    // se, center //ws[1] en[0]
                    if ((tree.center[1] < bounds.en[1] || tree.en[0] < bounds.en[0]) 
                       || (tree.ws[1] > bounds.ws[1] || tree.center[0] > bounds.ws[0])) {
                        return false;
                    }
                    
                    return true;
                default:
                    return false;

            }
        }
        
        var withinBounds = function(tree, bounds) {
            return ((bounds.en[1] < tree.en[1] || bounds.en[0] < tree.en[0])  
               || (bounds.ws[1] > tree.ws[1] || bounds.ws[0] > tree.ws[0]));
        }


        var findNode = function(node, bounds) {
            //console.log("Looking for node", node, doc._id);

            console.log("HEY");
            var p = new Promise;
            Model.findOne({_id: node}).exec(function(err, tree) {
                if (err) throw(err);

                // do bounds fully contain me?
                if (withinBounds(tree, bounds)) {
                    p.fulfill(tree);
                    console.log("found tree", tree.center);
                    return;
                // Do any nodes fully contain the bounds?
                } else if (tree.children.wn && withinNode(tree, bounds, 'wn')) {
                    findNode(tree.children.wn, bounds)
                        .then(function(child) {
                            if (child) {
                                console.log("found child", child.center);
                                p.fulfill(child); // Someone has to return
                            }
                        });
                } else if (tree.children.en && withinNode(tree, bounds, 'en')) {
                    findNode(tree.children.en, bounds)
                        .then(function(child) {
                            if (child) {
                                console.log("found child", child.center);
                                p.fulfill(child); // Someone has to return
                            }
                        });
                } else if (tree.children.ws && withinNode(tree, bounds, 'ws')) {
                    findNode(tree.children.ws, bounds)
                        .then(function(child) {
                            if (child) {
                                console.log("found child", child.center);
                                p.fulfill(child); // Someone has to return
                            }
                        });
                } else if (tree.children.es && withinNode(tree, bounds, 'es')) {
                    findNode(tree.children.es, bounds)
                        .then(function(child) {
                            if (child) {
                                console.log("found child", child.center);
                                p.fulfill(child); // Someone has to return
                            }
                        });
                } else {
                    // must be touching a bit of everyone since the root covers the world
                    console.log("fail", child.center);
                    p.fulfill(tree);
                }
            });

            console.log("p");
            return p;

        }


        var promise = new Promise;
        //var findWithin = utils.within(options.collectionName);
        Model.findOne({isRoot: true}).exec(function(err, root) {
            if (err) throw (err);
            if (!root) { 
                promise.fulfill();
                return; 
            }
            findNode(root._id, bounds)
                .then(function(tree) {
                    promise.fulfill(tree);
                });

        });

        return promise;
    }

};

module.exports = statics;
