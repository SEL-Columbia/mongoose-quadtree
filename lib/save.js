//var utils = require('./utils.js');
var assert = require('assert');
var ObjectId = require('mongoose').Types.ObjectId;

function save(schema, options) {
    var QuadtreeModel = schema.statics.QuadtreeModel;

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
        var data = tree.data.filter(function(d) {
            return ((d.coordinates[1] <= nlat && d.coordinates[1] > slat)
                   && (d.coordinates[0] > wlng && d.coordinates[0] <= elng));
        });

        var model = new QuadtreeModel({
            en: [elng, nlat],
            ws: [wlng, slat],
            center: [(elng + wlng)/2.0, (slat + nlat)/2.0],
            count: data.length,
            data: [data]
        });
        
        return model.save();
    } 

    var updateNode = function(node, doc) {
        console.log("Looking for node", node);

        QuadtreeModel.findOne({_id: node}).exec(function(err, tree) {
            if (err) throw(err);
            //if (!tree) { return; }// Someones wiping the collection return;
            console.log('Node', node, tree.children, tree.count, options.threshold);
            if (tree.count < (options.threshold  || 2500)) { // is leaf
                console.log("At leaf");
                if (tree.count + 1 < (options.threshold  || 2500)) { // leaf with space
                    tree.data = tree.data || [];
                    tree.data.push(doc);
                    tree.count++;
                    tree.save(function(err, tree) {
                        if (err) throw (err);
                        console.log("Doc saved within existing node");
                    });
                    
                } else { // leaf with no space
                    var complete_count = 0;
                    tree.count++;
                    tree.data.append(doc);

                    // Break leaf data into four
                    createNode(tree.en[1], tree.ws[0], tree.center[1], tree.center[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.children.wn = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                    console.log("Doc saved after breaking tree");
                                });
                            }
                       });
       
                    createNode(tree.en[1], tree.center[0], tree.center[1], tree.en[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.children.en = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                });
                            }
                       });
       
                    createNode(tree.center[1], tree.ws[0], tree.ws[1], tree.center[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.children.ws = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                });
                            }
                       });
       
                    createNode(tree.center[1], tree.center[0], tree.ws[1], tree.en[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.children.es = model._id;
                            tree.data = [];
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                });
                            }
                       });
                }
            } else { // Must be a node, recurse to find leaf
                switch(withinNode(tree, doc.coordinates)) {
                    case 'wn':
                        updateNode(tree.children.wn, doc);
                        break;
                    case 'en':
                        updateNode(tree.children.en, doc);
                        break;
                    case 'ws':
                        updateNode(tree.children.ws, doc);
                        break;
                    case 'es':
                        updateNode(tree.children.es, doc);
                        break;
                    default:
                        break;
                }
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

    schema.post('save', function(doc) {
        var self = this;
        QuadtreeModel.findOne({isRoot: true}).exec(function(err, root) {
            if (err) throw (err);
            if (!root) { return; }// Someones wiping the collection return;
            updateNode(root._id, doc); // Redundant root look up but w/e, its cleaner
        });
    });
}

module.exports = save;
