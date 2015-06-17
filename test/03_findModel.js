var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Promise = require('mongoose').Promise;
var Model = require('../models/model.js').Model;
var sites = require('./fixtures/facilities.js');

var total = 0;
var max_leaf;
var leaf_nodes;
var alot_leaf_nodes;

var findWithin;
describe('Mongoose Quadtree Machine', function(done) {
    before(function(done) {
        mongoose.connect('mongodb://localhost/test', {});
        var db = mongoose.connection;
        db.on('error', console.error.bind(console, 'connection err:'));
        db.once('open', function() {
            //console.log('Connected to Mongo DB at ' + db.host + ":" + db.port);
        });

        done();

        // Helper method for testing
        findWithin = function(nlat, wlng, slat, elng) { 
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
                    Model.initTree()
                        .onResolve(function(err) {
                            if (err) throw (err);
                            var QuadtreeModel = Model.QuadtreeModel;
                            QuadtreeModel.find({}).exec(function(err, sites) {
                                if (err) throw(err);
                                sites.should.be.ok;
                                sites.forEach(function(site) {

                                    if(site.isLeaf && site.count > 93) {
                                        console.log(site._id, site.count, "max leaf");
                                        max_leaf = site;
                                    }

                                });
                                done();
                            });

                         });

                });
            });
        });
    });

    afterEach(function(done) {
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


    describe('Finding facilities', function(done) {

        it('should find no facilities within bounds', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;
            Model.findNodes({'en': [80, 10], 'ws': [-100, -10]})
                .onResolve(function(err, data) {
                    if (err) throw (err);
                    data.should.be.ok;
                    data.should.have.length(0);
                    findWithin(10, -100, -10, 80).exec(function(err, sites) {
                        if(err) throw(err);
                        sites.should.have.length(0);
                        done();
                    }); 
                });
        });

        it('should find all facilities within bounds', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;
            Model.findNodes({'en': [7, 14], 'ws': [6, 12]})
                .onResolve(function(err, data) {
                    if (err) throw (err);
                    data.should.be.ok;
                    var quadSites = [] 
                    data.forEach(function(site) {
                        site.data.forEach(function(s) {
                           quadSites.push(String(s._id));
                        });
                    }); 

                    leaf_nodes = quadSites; //XXX using this in tree test below
                    findWithin(14, 6, 12, 7).exec(function(err, sites) {
                        if(err) throw(err);
                        assert(quadSites.length >= sites.length);
                        console.log(quadSites.length);
                        sites.forEach(function(s) {
                            assert(quadSites.indexOf(String(s._id)) > -1);
                        });

                        done();
                    }); 
                });
        });

        it('should find all facilities within really large bounds', function(done) {
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
                        site.data.forEach(function(s) {
                           quadSites.push(String(s._id));
                        });
                    }); 

                    alot_leaf_nodes = quadSites; //XXX using this in tree test below
                    findWithin(nlat, wlng, slat, elng).exec(function(err, sites) {
                        if(err) throw(err);
                        quadSites.length.should.equal(sites.length);
                        done();
                    }); 
                });
        });

    });

    describe('Finding facilities subtree', function(done) {
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
                //tree.data.forEach(function(d) {
                //    data.push(d._id);
                //});
                p.fulfill(tree.data);
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


        it('should find no subtree within bounds', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;
            Model.findSubtree({'en': [80, 10], 'ws': [-100, -10]})
                .onResolve(function(err, tree) {
                    tree.should.be.ok;
                    done();
                    //data.should.have.length(0);
                    //findWithin(10, -100, -10, 80).exec(function(err, sites) {
                    //    if(err) throw(err);
                    //    sites.should.have.length(0);
                    //    done();
                    //}); 
                });
        });

        it('should retrieve subtree containing all facilities within bounds', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;
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

        it('should retrieve subtree containing all facilities within really large bounds', function(done) {
            var nlat = 85;
            var elng = 180;
            var slat = -85;
            var wlng = -180;
            var QuadtreeModel = Model.QuadtreeModel;
            Model.findSubtree({'en': [elng, nlat], 'ws': [wlng, slat]})
                .onResolve(function(err, tree) {
                    tree.should.be.ok;
                    getLeaves(tree)
                        .onResolve(function(err, data) {
                            if (err) throw (err);
                            data.length.should.equal(alot_leaf_nodes.length);
                            data.forEach(function(s) {
                                assert(alot_leaf_nodes.indexOf(String(s._id)) > -1);
                            });
                            done();
                        });
                });
        });

    });

});

