var utils = require('./utils.js');
var LZString = require('lz-string');
function statics(schema, options) {
    var Promise = require('mongoose').Promise;

    // Eliminate all tree models
    // XXX Might as well make this a promise
    schema.statics.wipeQuadTree = function(callback) {
        var QuadtreeModel = this.QuadtreeModel;
        if (callback) {
            QuadtreeModel.find({}).remove(callback);
        } else {
            QuadtreeModel.find({}).remove();
        }
    }

    // Find the root node of an already initilized tree
    // XXX Might as well make this a promise
    schema.statics.root = function(callback) {
        // Theres only ever one element that can be the root;
        var self = this;
        self.QuadtreeModel.findOne({isRoot: true}).exec(callback);
    }

    // Initilize the tree, first thing called by users program
    // Adds a reference to the connected Model to utils
    // forceRebuild: Wipe the tree if one exists and redo
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
        
        
                    if ((count > options.threshold ) && (model.sep > options.seperation)) {
                        // Handle children promises
                        var complete_count = 0;
                        function onComplete(err) {
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
                                .onResolve(onComplete);
        
                            _createNode(nlat, model.center[0], model.center[1], elng, model._id, 'en')
                                .onResolve(onComplete);
        
                            _createNode(model.center[1], wlng, slat, model.center[0], model._id, 'ws')
                                .onResolve(onComplete);
        
                            _createNode(model.center[1], model.center[0], slat, elng, model._id, 'es')
                                .onResolve(onComplete);
                        });

                       // console.log("parent @", nlat, elng, slat, wlng, count);
        
                    } else if (count > 0){
                        findWithin(nlat, wlng, slat, elng)
                            .exec(function(err, sites) {
                                if (err) throw (err);

                                model.data = sites;
                                if (options.compress) {
                                    model.data = [LZString.compress(JSON.stringify(sites))];
                                }
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
                    .onResolve(function(err) { p.fulfill() });
                });

                return;
            }

            _createNode(nlat, wlng, slat, elng, null)
                .onResolve(function(err) { p.fulfill() });

        });

        return p;

    }

    // Find all leaf nodes defined within bounds for an already inited tree
    // bounds: {'en': [lon. lat], 'ws': [lon, lat]}
    schema.statics.findNodes = function(bounds) {
        var self = this;
        var Model = self.QuadtreeModel;

        

        var findNodes = function(node, bounds) {
            var data = [];
            var complete_count = 0;

            var onComplete = function(err, nodes) {
                complete_count++;
                data = data.concat(nodes);
                if (complete_count == 4) {
                    p.fulfill(data);
                }
            }

            var p = new Promise;
            Model.findOne({_id: node}).exec(function(err, tree) {
                if (err) throw(err);

                //console.log("Looking for node", node, tree.center);
                // do bounds fully contain me?
                if (tree.isLeaf && tree.data) {
                    p.fulfill([tree]);
                    return;
                }

                // Do any nodes fully contain the bounds?
                if (tree.children.wn && utils.crossesNode(tree, bounds, 'wn')) {
                    findNodes(tree.children.wn, bounds)
                        .onResolve(onComplete);
                } else {
                    onComplete(null, []);
                };

                if (tree.children.en && utils.crossesNode(tree, bounds, 'en')) {
                    findNodes(tree.children.en, bounds)
                        .onResolve(onComplete);
                } else {
                    onComplete(null, []);
                };

                if (tree.children.ws && utils.crossesNode(tree, bounds, 'ws')) {
                    findNodes(tree.children.ws, bounds)
                        .onResolve(onComplete);
                } else {
                    onComplete(null, []);
                };

                if (tree.children.es && utils.crossesNode(tree, bounds, 'es')) {
                    findNodes(tree.children.es, bounds)
                        .onResolve(onComplete);
                } else {
                    onComplete(null, []);
                };

            });

            return p;

        }

        var promise = new Promise;
        Model.findOne({isRoot: true}).exec(function(err, root) {
            if (err) throw (err);
            if (!root) { 
                promise.fulfill([]);
                return; 
            }
            findNodes(root._id, bounds)
                .onResolve(function(err, data) {
                    console.log("hey im done", data.length);
                    promise.fulfill(data);
                });

        });

        return promise;
    }


    // Find all nodes defined within bounds for an already inited tree
    // bounds: {'en': [lon. lat], 'ws': [lon, lat]}
    // This returns a tree rooted at root with octree expansions ONLY
    // where required to define all nodes within bounds
    schema.statics.findSubtree = function(bounds, compress) {
        var self = this;
        var Model = self.QuadtreeModel;
        

        var findSubtree = function(node, bounds, dir) {
            var p = new Promise;
            Model.findOne({_id: node}).exec(function(err, tree) {
                if (err) throw(err);

                var complete_count = 0;
                var onComplete = function(err, child, cdir) {
                    complete_count++;
                    tree.children[cdir] = child;
                    tree.count += (child.count || 0);;

                    if (complete_count == 4) {
                        if (tree.count != 0) 
                            p.fulfill(tree, dir);
                        else
                            p.fulfill({}, dir);
                    }
                }

                //console.log("Looking for node", node, tree.center);
                // do bounds fully contain me?
                if (tree.isLeaf) {
                    if (tree.data)
                        p.fulfill(tree, dir);
                    else 
                        p.fulfill({}, dir);

                    return;
                }

                // Do any nodes fully contain the bounds?
                tree.count = 0;
                if (tree.children.wn && utils.crossesNode(tree, bounds, 'wn')) {
                    findSubtree(tree.children.wn, bounds, 'wn')
                        .onResolve(onComplete);
                } else {
                    onComplete(null, {}, 'wn');
                };

                if (tree.children.en && utils.crossesNode(tree, bounds, 'en')) {
                    findSubtree(tree.children.en, bounds, 'en')
                        .onResolve(onComplete);
                } else {
                    onComplete(null, {}, 'en');
                };

                if (tree.children.ws && utils.crossesNode(tree, bounds, 'ws')) {
                    findSubtree(tree.children.ws, bounds, 'ws')
                        .onResolve(onComplete);
                } else {
                    onComplete(null, {}, 'ws');
                };

                if (tree.children.es && utils.crossesNode(tree, bounds, 'es')) {
                    findSubtree(tree.children.es, bounds, 'es')
                        .onResolve(onComplete);
                } else {
                    onComplete(null, {}, 'es');
                };

            });

            return p;

        }

        var promise = new Promise;
        Model.findOne({isRoot: true}).exec(function(err, root) {
            if (err) throw (err);
            if (!root) { 
                promise.fulfill({});
                return; 
            }

            findSubtree(root._id, bounds, 'root')
                .onResolve(function(err, tree, dir) {
                    console.log("hey im done", tree.count);
                    promise.fulfill(tree);
                });

        });

        return promise;
    }

};

module.exports = statics;
