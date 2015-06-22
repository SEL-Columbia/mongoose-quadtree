var utils = require('./utils.js');
var LZString = require('lz-string');

function save(schema, options) {
    var QuadtreeModel = schema.statics.QuadtreeModel;
    var ObjectId = require('mongoose').Types.ObjectId;
    var Promise = require('mongoose').Promise;

    // Find what quadrant coordinates c belong to
    // c: coordinates to compare against tree bounds
    // tree: current node to compare coordinates against
    var withinNode = function(tree, c) {
        if ((c[1] <= tree.en[1] && c[1] > tree.center[1])  
           && (c[0] > tree.ws[0] && c[0] <= tree.center[0])) {
            return 'wn'; 
        }

        if ((c[1] <= tree.en[1] && c[1] > tree.center[1])
           && (c[0] > tree.center[0] && c[0] <= tree.en[0])) {
            return 'en';
        }

        if ((c[1] <= tree.center[1] && c[1] > tree.ws[1])
           && (c[0] > tree.ws[0] && c[0] <= tree.center[0])) {
            return 'ws';
        }

        if ((c[1] <= tree.center[1] && c[1] > tree.ws[1]) 
           && (c[0] > tree.center[0] && c[0] <= tree.en[0])) {
            return 'es';
        }

        return '';
    }

    // Helper function for building children for newly broken node
    // nlat, wlng, slat, elng: bounds for new node
    // dir: Which quadrant of parent to update
    var createNode = function(nlat, wlng, slat, elng, dir) {
        var p = new Promise;

        var findWithin = utils.within(options.collectionName);
        findWithin(nlat, wlng, slat, elng).exec(function(err, sites)  {
            if (err) throw (err);

            var model = new QuadtreeModel({
                en: [elng, nlat],
                ws: [wlng, slat],
                center: [(elng + wlng)/2.0, (slat + nlat)/2.0],
                count: sites.length,
                sep: Math.abs(wlng - elng),
                isLeaf: true,
                data: sites
            });
            
            if (options.compress) {
                var stringData = JSON.stringify(sites);
                model.data = [LZString.compressToUTF16(stringData)];
                model.compressedSize = model.data[0].length;
                model.uncompressedSize = stringData.length;
            }

            model.save()
                .onResolve(function(err, model) {
                    p.fulfill(model, dir);
                })
        });

        return p;

    } 

    // Recurse until leaf node which would contain doc is found. 
    // Update node and travel back up tree in reverse updating counts.
    // Break leaf node if threshold is exceeded.
    // node: current node id
    // doc: newly added document
    // 
    // XXX Doc is never directly added or used as anything more then a reference to find
    // the node that would contain. The asynchronous nature of mongo does not gurantee that
    // this method is called directly after a SINGLE insert happens in the original model
    // this quadtree index is built on.
    //
    // Handles updates (that are done through save) just fine. 
    var updateNode = function(node, doc) {
        var p = new Promise;

        QuadtreeModel.findOne({_id: node}).exec(function(err, tree) {
            if (err) throw(err);

            // Record previous count to determine new count difference 
            var old_count = tree.count;

            // If leaf is reached
            if (tree.isLeaf) {
                var findWithin = utils.within(options.collectionName);

                // Determine current count in this node (doc would of been added in main model by this point)
                findWithin(tree.en[1], tree.ws[0], tree.ws[1], tree.en[0]).count().exec(function(err, count)  {
                    if (err) throw(err);

                    tree.count = count; // Update count

                    // If threshold isn't exceeded 
                    if ((tree.count <= options.threshold) || (tree.sep <= options.seperation)) { // leaf with space or no more division space
                        findWithin(tree.en[1], tree.ws[0], tree.ws[1], tree.en[0]).exec(function(err, sites)  {
                            if (err) throw(err);
                            tree.data = sites;
                            if (options.compress) {
                                var stringData = JSON.stringify(sites);
                                tree.data = [LZString.compressToUTF16(stringData)];
                                tree.compressedSize = tree.data[0].length;
                                tree.uncompressedSize = stringData.length;
                            }

                            tree.save(function(err, tree) {
                                if (err) throw (err);
                                p.fulfill(tree.count - old_count, tree);
                            });
                        });
                        
                    // If threshould is exceeded
                    } else {
                        function onComplete(err, model, dir) {
                            complete_count++;
                            tree.children[dir] = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    p.fulfill(tree.count - old_count, tree);
                                });
                            }
                        }

                        // Upgrade nodes status from leaf to non-leaf
                        var complete_count = 0;
                        tree.isLeaf = false;
                        tree.data = [];

                        // Break leaf data into four
                        createNode(tree.en[1], tree.ws[0], tree.center[1], tree.center[0],'wn')
                           .onResolve(onComplete);
       
                        createNode(tree.en[1], tree.center[0], tree.center[1], tree.en[0],'en')
                           .onResolve(onComplete);
       
                        createNode(tree.center[1], tree.ws[0], tree.ws[1], tree.center[0],'ws')
                           .onResolve(onComplete);
       
                        createNode(tree.center[1], tree.center[0], tree.ws[1], tree.en[0],'es')
                           .onResolve(onComplete);
                    }
                });
            } else { // Must be a node, recurse to find leaf

                // Update counts as stack is cleaned up
                function onComplete(err, count, childtree) {
                    tree.count += count;
                    tree.save(function(err, tree) {
                        if (err) throw (err);
                        p.fulfill(tree.count - old_count, childtree);
                    });
                } 

                // Recurse into correct child
                switch(withinNode(tree, doc.coordinates)) {
                    case 'wn':
                        updateNode(tree.children.wn, doc)
                           .onResolve(onComplete);
                        break;
                    case 'en':
                        updateNode(tree.children.en, doc)
                           .onResolve(onComplete);
                        break;
                    case 'ws':
                        updateNode(tree.children.ws, doc)
                           .onResolve(onComplete);
                        break;
                    case 'es':
                        updateNode(tree.children.es, doc)
                           .onResolve(onComplete);
                        break;
                    default:
                        break;
                }
            }
        });

        return p;
    }

    schema.post('save', function(doc) {
        var self = this;
        QuadtreeModel[doc._id] = new Promise; // Let user listen to save XXX allow multiple promise hooks on same promise
        utils.lock.writeLock(function(release) {
            QuadtreeModel.findOne({isRoot: true}).exec(function(err, root) {
                if (err) throw (err);
                if (!root) { return; }

                // Update all tree nodes down to leaf node containing doc
                updateNode(root._id, doc) // Redundant root look up but w/e, its cleaner
                    .onResolve(function(err, count, childtree) {
                        if (err) throw (err);
                        release();
                        QuadtreeModel[doc._id].fulfill(childtree, count);
                        //XXX find way to delete QuadtreeModel[doc._id];
                    });
            });

        });
    });

    // Recurse until leaf node which would contain doc is found. 
    // Update count and data where this document would of been found.
    //
    // node: current node id
    // doc: removed document
    //
    // Does not combine children nodes
    var removeNode = function(node, doc) {
        var p = new Promise;

        QuadtreeModel.findOne({_id: node}).exec(function(err, tree) {
            if (err) throw(err);
            var old_count = tree.count;

            // Leaf containing doc found
            if (tree.isLeaf) {
                var findWithin = utils.within(options.collectionName);
                findWithin(tree.en[1], tree.ws[0], tree.ws[1], tree.en[0]).count().exec(function(err, count)  {
                    if (err) throw(err);
                    tree.count = count;

                    // Never remove a tree node
                    findWithin(tree.en[1], tree.ws[0], tree.ws[1], tree.en[0]).exec(function(err, sites)  {
                        if (err) throw(err);
                        tree.data = sites;
                        if (options.compress) {
                            var stringData = JSON.stringify(sites);
                            tree.data = [LZString.compressToUTF16(stringData)];
                            tree.compressedSize = tree.data[0].length;
                            tree.uncompressedSize = stringData.length;
                        }

                        tree.save(function(err, tree) {
                            if (err) throw (err);
                            p.fulfill(tree.count - old_count, tree);
                        });
                    });
                        
                });
            } else { // Must be a node, recurse to find leaf
                function onComplete(err, count, childtree) {
                    tree.count += count; // count will be negative
                    tree.save(function(err, tree) {
                        if (err) throw (err);
                        p.fulfill(tree.count - old_count, childtree);
                    });
                } 

                switch(withinNode(tree, doc.coordinates)) {
                    case 'wn':
                        removeNode(tree.children.wn, doc)
                           .onResolve(onComplete);
                        break;
                    case 'en':
                        removeNode(tree.children.en, doc)
                           .onResolve(onComplete);
                        break;
                    case 'ws':
                        removeNode(tree.children.ws, doc)
                           .onResolve(onComplete);
                        break;
                    case 'es':
                        removeNode(tree.children.es, doc)
                           .onResolve(onComplete);
                        break;
                    default:
                        break;
                }
            }
        });
        
        return p;
    }

    schema.post('remove', function(doc) {
        var self = this;
        QuadtreeModel[doc._id] = new Promise;
        utils.lock.writeLock(function(release) {
            QuadtreeModel.findOne({isRoot: true}).exec(function(err, root) {
                if (err) throw (err);
                if (!root) { return; }

                // Update all tree nodes down to leaf node containing doc
                removeNode(root._id, doc)
                    .onResolve(function(err, count, childtree) {
                        if (err) throw (err);
                        release();
                        QuadtreeModel[doc._id].fulfill(childtree, count);
                        //XXX delete QuadtreeModel[doc._id];
                    });
            });

        });
    });
}

module.exports = save;
