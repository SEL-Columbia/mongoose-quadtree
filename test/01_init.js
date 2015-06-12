var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Model = require('../models/model.js').Model;
var sites = require('./fixtures/facilities.js');
var total = 0;

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

    describe('Initilization tests', function(done) {
        it('should initTree the quadtree structure for Model', function(done) {
            Model.initTree()
                .then(function() {
                    var QuadtreeModel = Model.QuadtreeModel;
                    QuadtreeModel.find({}).exec(function(err, sites) {
                        if (err) throw(err);
                        sites.should.be.ok;
                        sites.should.have.length(45);
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
            done(); //TODO
            //Model.initTree()
            //    .then(function() {
            //        Model.root(function(err, root) {
            //            if (err) throw(err);
            //            var id = root._id;
            //            Model.initTree(true)
            //                .then(function() {
            //                    Model.root(function(err, root) {
            //                        if (err) throw(err);
            //                        root._id.should.not.match(id);
            //                        done();
            //                    });
            //               });
            //        });
            //    });
        });

    });
});

