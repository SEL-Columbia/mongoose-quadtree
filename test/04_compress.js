var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Promise = require('mongoose').Promise;
var Model = require('../models/modelCompress.js').Model;
var sites = require('./fixtures/facilities.js');
var LZString = require('lz-string');
var total = 0;
var max_leaf;

describe('Mongoose Quadtree Machine', function(done) {
    before(function(done) {
        mongoose.connect('mongodb://localhost/test', {});
        var db = mongoose.connection;
        db.on('error', console.error.bind(console, 'connection err:'));
        db.once('open', function() {
            //console.log('Connected to Mongo DB at ' + db.host + ":" + db.port);
        });

        done();
    });

    after(function(done) {
        mongoose.disconnect();
        done();
    });

    beforeEach(function(done) {
        Model.find({}).remove(function(err, result) {
            if (err) throw (err);
            var quadtree = Model.collection.name + "_quadtree";
            mongoose.connection.collections[quadtree].remove({}, function(err, result) {
                if (err) throw (err);   

                Model.collection.insert(sites, function(err, result) {
                    if (err) throw (err);   
                    total = result.result.n;
                    done();
                });
            });
        });
    });

    describe('Active compression  tests', function(done) {
        it('should initTree the quadtree structure for Model', function(done) {
            Model.initTree()
                .then(function() {
                    var QuadtreeModel = Model.QuadtreeModel;
                    QuadtreeModel.find({}).exec(function(err, sites) {
                        if (err) throw(err);
                        sites.should.be.ok;
                        sites.should.have.length(81);
                        done();
                    });

                 });
        });

        it('should grab root for Quadtree', function(done) {
            Model.initTree()
                .then(function() {
                    Model.root(function(err, root) {
                        if (err) throw(err);
                        root.should.be.ok;
                        //root.should.have.length(1);
                        root._id.should.be.ok;
                        done();
                    });
                });
        });

        it('should not recreate the Quadtree', function(done) {
            Model.initTree()
                .then(function() {
                    Model.root(function(err, root) {
                        if (err) throw(err);
                        var id = root._id;
                        Model.initTree()
                            .then(function() {
                                Model.root(function(err, root) {
                                    if (err) throw(err);
                                    root._id.should.match(id);
                                    done();
                                });
                           });
                    });
                });
        });

        it('should recreate the Quadtree', function(done) {
            Model.initTree()
                .then(function() {
                    Model.root(function(err, root) {
                        if (err) throw(err);
                        var id = root._id;
                        Model.initTree(true)
                            .then(function() {
                                Model.root(function(err, root) {
                                    if (err) throw(err);
                                    root._id.should.not.match(id);
                                    done();
                                });
                           });
                    });
                });
        });

        it('should find all facilities within bounds', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;

            // Helper method for testing
            function findWithin(nlat, wlng, slat, elng) { 
                return Model.find({
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

            var totalCompressed = 0;
            var totalUncompressed = 0;
            Model.initTree()
                .onResolve(function(err) {
                    Model.findNodes({'en': [7, 14], 'ws': [6, 12]})
                        .onResolve(function(err, data) {
                            if (err) throw (err);
                            data.should.be.ok;
                            var quadSites = [] 
                            data.forEach(function(site) {
                                    
                                totalUncompressed += site.uncompressedSize;
                                totalCompressed += site.compressedSize;
                                 var c = LZString.decompress(site.data[0]);
                                 var d = JSON.parse(c);
                                 d.forEach(function(s) {
                                    quadSites.push(String(s._id));
                                 });
                            }); 

                            leaf_nodes = quadSites; //XXX using this in tree test below
                            findWithin(14, 6, 12, 7).exec(function(err, sites) {
                                if(err) throw(err);
                                assert(quadSites.length >= sites.length);
                                sites.forEach(function(s) {
                                    assert(quadSites.indexOf(String(s._id)) > -1);
                                });

                                console.log("compressed", totalCompressed, "uncompressed", totalUncompressed);
                                console.log("ratio", totalCompressed/totalUncompressed * 100);
                                done();
                            }); 
                        });
                });
        });

        it('should find alot of facilities within bounds', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;

            // Helper method for testing
            function findWithin(nlat, wlng, slat, elng) { 
                return Model.find({
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

            var totalCompressed = 0;
            var totalUncompressed = 0;
            Model.initTree()
                .onResolve(function(err) {
                    var nlat = 85;
                    var elng = 180;
                    var slat = -85;
                    var wlng = -180;
                    var QuadtreeModel = Model.QuadtreeModel;
                    Model.findNodes({'en': [elng, nlat], 'ws': [wlng, slat]})
                        .onResolve(function(err, data) {
                            if (err) throw (err);
                            data.should.be.ok;
                            var quadSites = [] 
                            data.forEach(function(site) {
                                    
                                totalUncompressed += site.uncompressedSize;
                                totalCompressed += site.compressedSize;
                                 var c = LZString.decompress(site.data[0]);
                                 var d = JSON.parse(c);
                                 d.forEach(function(s) {
                                    quadSites.push(String(s._id));
                                 });
                            }); 

                            findWithin(nlat, wlng, slat, elng).exec(function(err, sites) {
                                if(err) throw(err);
                                quadSites.length.should.equal(sites.length);
                                console.log("compressed", totalCompressed, "uncompressed", totalUncompressed);
                                console.log("ratio", totalCompressed/totalUncompressed * 100);
                                done();
                            }); 
                        });
                });
        });

        it('should retrieve subtree containing all facilities within bounds', function(done) {

            function getLeaves(tree) {
                var data = [];
                var c = 0;
                function onComplete(err, cdata) {
                    c++;
                    data = data.concat(cdata);
                    if (c == 4) {
                        p.fulfill(data);
                    }
                } 
                var p = new Promise; 
                if (!tree || JSON.stringify(tree) === '{}') {
                    p.fulfill([]);
                    return p;
                }

                if (tree.isLeaf) {
                    var c = LZString.decompress(tree.data[0]);
                    var d = JSON.parse(c);
                    p.fulfill(d);
                    return p;
                } 

                getLeaves(tree.children.en)
                    .onResolve(onComplete);
                getLeaves(tree.children.es)
                    .onResolve(onComplete);
                getLeaves(tree.children.ws)
                    .onResolve(onComplete);
                getLeaves(tree.children.wn)
                    .onResolve(onComplete);

                return p;
            }


            var QuadtreeModel = Model.QuadtreeModel;
            Model.initTree()
                .onResolve(function(err) {
                    if (err) throw (err);
                Model.findSubtree({'en': [7, 14], 'ws': [6, 12]})
                    .onResolve(function(err, tree) {
                        tree.should.be.ok;
                        getLeaves(tree)
                            .onResolve(function(err, data) {
                                if (err) throw (err);
                                data.length.should.equal(leaf_nodes.length);
                                data.forEach(function(s) {
                                    assert(leaf_nodes.indexOf(String(s._id)) > -1);
                                });
                                done();
                            });
                    });
                });
        });

        it('should add Model to existing maxed out leaf until it splits', function(done) {
            var i;
            Model.initTree()
                .onResolve(function(err) {
                   var QuadtreeModel = Model.QuadtreeModel;
                   QuadtreeModel.find({}).exec(function(err, sites) {
                       if (err) throw(err);
                       sites.should.be.ok;
                       sites.forEach(function(site) {

                           if(site.isLeaf && site.count > 93) {
                               max_leaf = site;
                           }
                       });

                        var resolved = 101 - max_leaf.count;
                       for (i = 0; i + max_leaf.count < 101; i++) {
                           max_leaf.center[0] + i*0.001;
                           max_leaf.center[1] + i*0.002;
                           var model = new Model({name: ''+ i, coordinates: max_leaf.center });
                           model.save(function(err, m) {
                               if (err) throw (err);
                               var QuadtreeModel = Model.QuadtreeModel;
                               QuadtreeModel[m._id].onResolve(function(err, node, count) {
                                   resolved--;
                                   
                                   // Later update that didnt insert new nodes
                                   if (count == 0) {
                                       node.count.should.match((101 - max_leaf.count));
                                   }

                                   // First update to break leaf node
                                   if (count == 7) {
                                       node.children.should.be.ok;
                                       node.count.should.equal(101);
                                       node.children.en.should.be.ok;
                                       assert(node.isLeaf == false);
                                   }

                                   if (resolved == 0) { 
                                           done();
                                   }
                               });
                           });
                       };
                    });
                });

        });

    });
});

