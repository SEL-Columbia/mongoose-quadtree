var utils = require('./utils.js');
var LZString = require('lz-string');
function statics(schema, options) {
    var Promise = require('mongoose').Promise;

    // Eliminate all tree models
    schema.statics.wipeQuadTree = function(callback) {
        var QuadtreeModel = this.QuadtreeModel;
        if (callback) {
            QuadtreeModel.find({}).remove(callback);
        } else {
            return QuadtreeModel.find({}).remove().exec();
        }
    }

    // Find the root node of an already initilized tree
    schema.statics.root = function(callback) {
        // Theres only ever one element that can be the root;
        var self = this;
        if (callback) {
            self.QuadtreeModel.findOne({isRoot: true}).exec(callback);
        } else {
           return self.QuadtreeModel.findOne({isRoot: true}).exec();
        }
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

        // Helper function for recursively creating quadtree nodes
        // nlat, wlng, slat, elng: Current node boundries
        // pModel: Parent node id
        // pos: What quadrant of the parent node this node covers
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
        
                    // Let Parent know about you
                    if (pModel) {
                        child = {}; 
                        child["children." + pos]  =  model._id;

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
        
        
                    // CASE 0: Threshold exceed, create children and recurse
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

                    // CASE 1a: Threshold not exceeded, record data and return
                    } else if (count > 0){
                        findWithin(nlat, wlng, slat, elng)
                            .exec(function(err, sites) {
                                if (err) throw (err);

                                model.data = sites;
                                model.isLeaf = true;

                                // Compress if requested, compression type compatiable with LS 
                                if (options.compress) {
                                    var stringData = JSON.stringify(sites);
                                    model.data = [LZString.compressToUTF16(stringData)];
                                    model.compressedSize = model.data[0].length;
                                    model.uncompressedSize = stringData.length;
                                }

                                model.save(function(err, model) {
                                    if (err) throw (err);
                                    promise.fulfill();
                                });
        
                            });

                    // CASE 1b: Threshold not exceeded, no data found, record and return
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
        
        var p = new Promise;
        forceRebuild = forceRebuild || false;

        // See if tree already exists 
        self.QuadtreeModel.find({isRoot: true}).count().exec(function(err, count) { 
            if (err) throw (err);
            
            // Return if root found and forceRebuild is not required 
            if (count == 1 && !forceRebuild) {
                p.fulfill();
                return;
            }

            // Wipe the tree and rebuild
            if (forceRebuild) {
                self.wipeQuadTree(function(err, sites) {
                    if (err) throw (err);
                    _createNode(nlat, wlng, slat, elng, null)
                    .onResolve(function(err) { p.fulfill() });
                });

                return;
            }

            // No root node was found, build tree
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

        // Helper function for finding nodes intersected by bounds
        // node: Current node id
        // bounds: User specified area {'en': [lon. lat], 'ws': [lon, lat]}
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

            // Query quadtree model for this node
            Model.findOne({_id: node}).exec(function(err, tree) {
                if (err) throw(err);

                // Leaf node reached && node guranteed to touch bounds => return data
                if (tree.isLeaf && tree.data) {
                    p.fulfill([tree]);
                    return;
                }

                // Do any nodes intersect bounds? If so recurse on em
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

        // Lock out writers while returning data
        // XXX: Find out how the hell this lib works. Confirm no writer starvation 
        utils.lock.readLock(function(release) {
            Model.findOne({isRoot: true}).exec(function(err, root) {
                if (err) throw (err);
                if (!root) { 
                    promise.fulfill([]);
                    release();
                    return; 
                }

                // Find all nodes that intersect or are contained within bounds
                findNodes(root._id, bounds)
                    .onResolve(function(err, data) {
                        promise.fulfill(data);
                        release();
                    });
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
        
        // Helper function for building subtree intersected by bounds
        // node: Current node id
        // bounds: User specified area {'en': [lon. lat], 'ws': [lon, lat]}
        // dir: Which quadrant to update in parent tree node
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

                // Leaf node reached && node guranteed to touch bounds => return data
                if (tree.isLeaf) {
                    if (tree.data)
                        p.fulfill(tree, dir);
                    else 
                        p.fulfill({}, dir);

                    return;
                }

                tree.count = 0; // Reset count, we aren't guranteed to have the same count as before

                // Do any nodes intersect bounds? If so recurse on em
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

        // Lock out writers while returning data
        // XXX: Find out how the hell this lib works. Confirm no writer starvation 
        utils.lock.readLock(function(release) {
            Model.findOne({isRoot: true}).exec(function(err, root) {
                if (err) throw (err);
                if (!root) { 
                    promise.fulfill({});
                    release();
                    return; 
                }

                // Find subtree that intersect or are contained within bounds
                findSubtree(root._id, bounds, 'root')
                    .onResolve(function(err, tree, dir) {
                        promise.fulfill(tree);
                        release();
                    });

            });
        });

        return promise;
    }

};

module.exports = statics;
