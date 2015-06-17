var utils = require('./utils.js');
var LZString = require('lz-string');

function save(schema, options) {
    var QuadtreeModel = schema.statics.QuadtreeModel;
    var ObjectId = require('mongoose').Types.ObjectId;
    var Promise = require('mongoose').Promise;


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

    var createNode = function(nlat, wlng, slat, elng, tree, dir) {
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
                tree.data = [LZString.compress(stringData)];
                tree.compressedSize = tree.data[0].length;
                tree.uncompressedSize = stringData.length;
            }
            //console.log("GONNA SAVE CHILD", model._id, model.count);

            model.save()
                .onResolve(function(err, model) {
                    p.fulfill(model, dir);
                })
        });

        return p;

    } 

    var updateNode = function(node, doc) {
        //console.log("Looking for node", node, doc._id);
        var p = new Promise;

        QuadtreeModel.findOne({_id: node}).exec(function(err, tree) {
            if (err) throw(err);
            var old_count = tree.count;

            //console.log('Node', node, tree.children, tree.count, options);
            if (tree.isLeaf) {
                var findWithin = utils.within(options.collectionName);
                findWithin(tree.en[1], tree.ws[0], tree.ws[1], tree.en[0]).count().exec(function(err, count)  {
                    if (err) throw(err);
                    tree.count = count;

                    //console.log("At leaf");
                    if ((tree.count <= options.threshold) || (tree.sep <= options.seperation)) { // leaf with space or no more division space
                        //console.log("Adding into leaf with sapce");
                        findWithin(tree.en[1], tree.ws[0], tree.ws[1], tree.en[0]).exec(function(err, sites)  {
                            if (err) throw(err);
                            tree.data = sites;
                            if (options.compress) {
                                var stringData = JSON.stringify(sites);
                                tree.data = [LZString.compress(stringData)];
                                tree.compressedSize = tree.data[0].length;
                                tree.uncompressedSize = stringData.length;
                            }

                            tree.save(function(err, tree) {
                                if (err) throw (err);
                                p.fulfill(tree.count - old_count, tree);
                            });
                        });
                        
                    } else { // leaf with no space
                        //console.log("Adding into leaf with NO space");

                        // Child create callback
                        function onComplete(err, model, dir) {
                            complete_count++;
                            tree.children[dir] = model._id;
                            //console.log("Added new model", model._id, complete_count, tree.count);
                            if (complete_count == 4) { 
                                //console.log("GONNA SAVE", tree.children);
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    p.fulfill(tree.count - old_count, tree);
                                    //console.log("Doc saved after breaking tree");
                                });
                            }
                        }

                        var complete_count = 0;
                        tree.isLeaf = false;
                        tree.data = [];

                        // Break leaf data into four
                        createNode(tree.en[1], tree.ws[0], tree.center[1], tree.center[0], tree, 'wn')
                           .onResolve(onComplete);
       
                        createNode(tree.en[1], tree.center[0], tree.center[1], tree.en[0], tree, 'en')
                           .onResolve(onComplete);
       
                        createNode(tree.center[1], tree.ws[0], tree.ws[1], tree.center[0], tree, 'ws')
                           .onResolve(onComplete);
       
                        createNode(tree.center[1], tree.center[0], tree.ws[1], tree.en[0], tree, 'es')
                           .onResolve(onComplete);
                    }
                });
            } else { // Must be a node, recurse to find leaf
                function onComplete(err, count, childtree) {
                    tree.count += count;
                    tree.save(function(err, tree) {
                        if (err) throw (err);
                        p.fulfill(tree.count - old_count, childtree);
                    });
                } 

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

    schema.pre('update', true, function(next, done) {
        //TODO: If coordinates change, what happens to data?
    });

    schema.pre('remove', true, function(next, done) {
        next();
        done();
    });
    
    schema.pre('save', true, function(next, done) {
        next();
        done();
    });

    schema.post('save', function(doc) {
        var self = this;
        QuadtreeModel[doc._id] = new Promise; // Let user listen to save XXX allow multiple promise hooks on same promise
        utils.lock.writeLock(function(release) {
            //console.log("WITHIN TREE");
            QuadtreeModel.findOne({isRoot: true}).exec(function(err, root) {
                if (err) throw (err);
                if (!root) { return; }// Someones wiping the collection return;
                //var findWithin = utils.within(options.collectionName);
                //findWithin(root.en[1], root.ws[0], root.ws[1], root.en[0]).count().exec(function(err, count)  {
                //    console.log(count, root.count);
                    //console.log(root._id, root.count);
                    updateNode(root._id, doc) // Redundant root look up but w/e, its cleaner
                        .onResolve(function(err, count, childtree) {
                            if (err) throw (err);
                            console.log("Updated count by:", count);
                            release();
                            QuadtreeModel[doc._id].fulfill(childtree, count);
                            //delete QuadtreeModel[doc._id];
                        });
                    

                //});
            });

        });
    });
}

module.exports = save;
