var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Model = require('../models/model.js').Model;
var sites = require('./fixtures/facilities.js');

var total = 0;
var max_leaf;

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
                        .then(function() {
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
                .then(function(data) {
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
                .then(function(data) {
                    data.should.be.ok;
                    var quadSites = [] 
                    data.forEach(function(site) {
                        site.data.forEach(function(s) {
                           quadSites.push(String(s._id));
                        });
                    }); 

                    findWithin(14, 6, 12, 7).exec(function(err, sites) {
                        if(err) throw(err);
                        assert(quadSites.length >= sites.length);
                        sites.forEach(function(s) {
                            assert(quadSites.indexOf(String(s._id)) > -1);
                        });

                        done();
                    }); 
                });
        });

        it('should find all facilities within really large bounds', function(done) {
            this.timeout = 50000;

            var nlat = 85;
            var elng = 180;
            var slat = -85;
            var wlng = -180;
            var QuadtreeModel = Model.QuadtreeModel;
            Model.findNodes({'en': [elng, nlat], 'ws': [wlng, slat]})
                .then(function(data) {
                    data.should.be.ok;
                    var quadSites = [] 
                    data.forEach(function(site) {
                        site.data.forEach(function(s) {
                           quadSites.push(String(s._id));
                        });
                    }); 

                    findWithin(nlat, wlng, slat, elng).exec(function(err, sites) {
                        if(err) throw(err);
                        quadSites.length.should.equal(sites.length);
                        done();
                    }); 
                });
        });

    });
});

