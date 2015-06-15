var utils = require('./utils.js');
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

    var createNode = function(nlat, wlng, slat, elng, tree) {

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
                data: [sites]
            });
            
            //console.log("GONNA SAVE CHILD", model._id, model.count);

            model.save()
                .then(function(model) {
                    p.fulfill(model);
                })
        });

        return p;

    } 

    var updateNode = function(node, doc, release) {
        //console.log("Looking for node", node, doc._id);

        QuadtreeModel.findOne({_id: node}).exec(function(err, tree) {
            if (err) throw(err);
            //if (!tree) { return; }// Someones wiping the collection return;
            //console.log('Node', node, tree.children, tree.count, options);
            if (tree.isLeaf) {
                //console.log("At leaf");
                if ((tree.count + 1 <= (options.threshold  || 2500)) 
                || (tree.sep <= (options.seperation || 1))) { // leaf with space or no more division space
                    tree.data = tree.data || [];
                    //console.log(tree.count, doc._id);
                    tree.data[tree.count++] = doc;
                    //console.log(tree.count, doc._id);
                    tree.save(function(err, tree) {
                        if (err) throw (err);

                        //console.log("Doc saved within existing node");
                        QuadtreeModel[doc._id].fulfill(tree);
                        release();
                        
                    });
                    
                } else { // leaf with no space
                    var complete_count = 0;
                    tree.data[tree.count++] = doc;
                    tree.isLeaf = false;
                    tree.__v++;

                    // Break leaf data into four
                    createNode(tree.en[1], tree.ws[0], tree.center[1], tree.center[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.children.wn = model._id;
                            //console.log("Added new model", model._id, complete_count, tree.count);
                            if (complete_count == 4) { 
                                //console.log("GONNA SAVE", tree.children);
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    //console.log("Doc saved after breaking tree");
                                    QuadtreeModel[doc._id].fulfill(tree);
                                    release();
                                });
                            }
                       });
       
                    createNode(tree.en[1], tree.center[0], tree.center[1], tree.en[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.children.en = model._id;
                            //console.log("Added new model", model._id, complete_count, tree.count);
                            if (complete_count == 4) { 
                                //console.log("GONNA SAVE", tree.children);
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    //console.log("Doc saved after breaking tree");
                                    QuadtreeModel[doc._id].fulfill(tree);
                                    release();
                                });
                            }
                       });
       
                    createNode(tree.center[1], tree.ws[0], tree.ws[1], tree.center[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.children.ws = model._id;
                            //console.log("Added new model", model._id, complete_count, tree.count);
                            if (complete_count == 4) { 
                                //console.log("GONNA SAVE", tree.children);
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    //console.log("Doc saved after breaking tree");
                                    QuadtreeModel[doc._id].fulfill(tree);
                                    release();
                                });
                            }
                       });
       
                    createNode(tree.center[1], tree.center[0], tree.ws[1], tree.en[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.children.es = model._id;
                            tree.data = [];
                            //console.log("Added new model", model._id, complete_count, tree.count);
                            if (complete_count == 4) { 
                                //console.log("GONNA SAVE", tree.children);
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    //console.log("Doc saved after breaking tree");
                                    QuadtreeModel[doc._id].fulfill(tree);
                                    release();
                                });
                            }
                       });
                }
            } else { // Must be a node, recurse to find leaf
                tree.update({'$inc': {'count': 1, '__v': 1}}, {new: true}, function(err, results) {
                    if (err) throw (err);

                    switch(withinNode(tree, doc.coordinates)) {
                        case 'wn':
                            updateNode(tree.children.wn, doc, release);
                            break;
                        case 'en':
                            updateNode(tree.children.en, doc, release);
                            break;
                        case 'ws':
                            updateNode(tree.children.ws, doc, release);
                            break;
                        case 'es':
                            updateNode(tree.children.es, doc, release);
                            break;
                        default:
                            break;
                    }
                });
            }
        });
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
                //console.log(root._id, root.count);
                updateNode(root._id, doc, release); // Redundant root look up but w/e, its cleaner
            });

        });
    });
}

module.exports = save;
