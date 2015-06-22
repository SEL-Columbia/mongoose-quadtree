var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Model = require('../models/model.js').Model;
var sites = require('./fixtures/facilities.js');

var total = 0;
var exisitingSites;

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
                    Model.initTree()
                        .onResolve(function(err) {
                            Model.find({}).exec(function(err, sites) {
                                if (err) throw(err);
                                sites.should.be.ok;
                                existingSites = sites;
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


    describe('Removing facilities', function(done) {
        it('should remove a model', function(done) {
            var QuadtreeModel = Model.QuadtreeModel;
            var total = 0;
            existingSites[0].remove(function(err, model) {
                if (err) throw (err);
                console.log(model);
                QuadtreeModel[model._id].onResolve(function(err, node, count) {
                    total += count;
                    total.should.equal(-1);
                    QuadtreeModel.findOne({isRoot: true}).exec(function(err, root) {
                        if (err) throw err;
                        root.count.should.match(1000 + total);
                        done();
                    });
                });
            });
        });

        it('should remove a ton of models', function(done) {
            var i;
            var resolved = 10;
            var total = 0;
            var QuadtreeModel = Model.QuadtreeModel;
            for (i = 0; i < 10; i++) {
                existingSites[i].remove(function(err, m) {
                    if (err) throw (err);
                    console.log(m);
                    QuadtreeModel[m._id].onResolve(function(err, node, count) {
                        resolved--;
                        total+=count;
                        if (resolved == 0) {
                            total.should.equal(-10);
                            QuadtreeModel.findOne({isRoot: true}).exec(function(err, root) {
                                if (err) throw err;
                                root.count.should.match(1000 + total);
                                done();
                            });
                        }
                    });
                });
            }
        });
    });
});

