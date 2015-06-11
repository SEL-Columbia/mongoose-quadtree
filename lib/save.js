//var utils = require('./utils.js');
var assert = require('assert');
var ObjectId = require('mongoose').Types.ObjectId;

function save(schema, options) {
    var QuadtreeModel = schema.statics.QuadtreeModel;

    var withinNode = function(tree, c) {
        if ((c[1] <= tree.nlat && c[1] > tree.center[1])  
           && (c[0] > tree.wlng && c[0] <= tree.center[0])) {
            return 'wn'; 
        }

        if ((c[1] <= tree.nlat && c[1] > tree.center[1])
           && (c[0] > tree.center[0] && c[0] <= tree.elng)) {
            return 'en';
        }

        if ((c[1] <= tree.center[1] && c[1] > tree.slat)
           && (c[0] > tree.wlng && c[0] <= tree.center[0])) {
            return 'ws';
        }

        if ((c[1] <= tree.center[1] && c[1] > tree.slat) 
           && (c[0] > tree.center[0] && c[0] <= tree.elng)) {
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

    var updateNode = function(node) {
        QuadtreeModel.findOne({_id: node}).exec(function(err, tree) {
            if (Object.keys(tree.children).length == 0) { // is leaf
                if (tree.count < (options.threshold  || 2500)) { // leaf with space
                    tree.data.append(doc);
                    tree.count++;
                    tree.save(function(err, tree) {
                        if (err) throw (err);
                    });
                    
                } else { // leaf with no space
                    var complete_count = 0;
                    tree.count++;
                    tree.data.append(doc);

                    // Break leaf data into four
                    createNode(tree.nlat, tree.wlng, tree.center[1], tree.center[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.wn = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                });
                            }
                       });
       
                    createNode(tree.nlat, tree.center[0], tree.center[1], tree.elng, tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.en = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                });
                            }
                       });
       
                    createNode(tree.center[1], tree.wlng, tree.slat, tree.center[0], tree)
                       .then(function(model) {
                            complete_count++;
                            tree.data = [];
                            tree.ws = model._id;
                            if (complete_count == 4) { 
                                tree.save(function(err, tree) {
                                    if (err) throw (err);
                                });
                            }
                       });
       
                    createNode(tree.center[1], tree.center[0], tree.slat, tree.elng, tree)
                       .then(function(model) {
                            complete_count++;
                            tree.es = model._id;
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
                        updateNode(tree.wn);
                        break;
                    case 'en':
                        updateNode(tree.en);
                        break;
                    case 'ws':
                        updateNode(tree.ws);
                        break;
                    case 'es':
                        updateNode(tree.es);
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
            
            updateNode(root._id); // Redundant root look up but w/e, its cleaner
        });
    });
}

module.exports = save;
