var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Model = require('../models/model.js').Model;
var sites = require('./fixtures/facilities.js');

var total = 0;
var max_leaf;
var almost_max_leaf;

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
                        .then(function() {
                            var QuadtreeModel = Model.QuadtreeModel;
                            QuadtreeModel.find({}).exec(function(err, sites) {
                                if (err) throw(err);
                                sites.should.be.ok;
                                sites.forEach(function(site) {

                                    if(site.isLeaf && site.count == 100) {
                                        console.log(site, "max leaf");
                                        max_leaf = site;
                                    }

                                    if(site.isLeaf && site.count === 99) {
                                        console.log(site, "almost max leaf");
                                        almost_max_leaf = site;
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


    describe('Adding facilities', function(done) {
        it('should add Model to existing leaf', function(done) {
            var model = new Model({name: 'Hello', coordinates: [1, 1] });
            model.save(function(err, model) {
                if (err) throw (err);
                var QuadtreeModel = Model.QuadtreeModel;
                QuadtreeModel[model._id].then(function(node) {
                    node.data[0].should.match(model);
                    done();
                });
            });
        });

        it('should add two Models to existing leaf', function(done) {
            var model = new Model({name: 'Hello', coordinates: [1, 1] });
            model.save(function(err, model) {
                if (err) throw (err);
                var QuadtreeModel = Model.QuadtreeModel;
                QuadtreeModel[model._id].then(function(node) {
                    var model2 = new Model({name: 'Hello', coordinates: [1, 1.001] });
                    model2.save(function(err, model2) {
                        if (err) throw (err);
                        var QuadtreeModel = Model.QuadtreeModel;
                        QuadtreeModel[model2._id].then(function(node2) {
                            node2.data[0]._id.should.match(model._id);
                            node2.data[1]._id.should.match(model2._id);
                            node._id.should.match(node._id);
                            done();
                        });
                    });
                });
            });
        });

        it('should add two Models to existing leaf concurrently', function(done) {
            var model = new Model({name: 'Hello', coordinates: [1, 1] });
            model.save(function(err, model) {
                if (err) throw (err);
                var model2 = new Model({name: 'Hello', coordinates: [1, 1.001] });
                model2.save(function(err, model2) {
                    if (err) throw (err);
                    var QuadtreeModel = Model.QuadtreeModel;
                    QuadtreeModel[model2._id].then(function(node2) {
                        console.log(node2);
                        console.log(model2);
                        console.log(model);

                        //node2.data[0]._id.should.match(model._id);
                        //node2.data[1]._id.should.match(model2._id);
                        done();
                    });
                });
            });
        });

        it('should add Model to existing maxed out leaf', function(done) {
            var model = new Model({name: 'Hello', coordinates: [1, 1] });
            model.save(function(err, model) {
                if (err) throw (err);
                var QuadtreeModel = Model.QuadtreeModel;
                QuadtreeModel[model._id].then(function(node) {
                    node.data[0].should.match(model);
                    done();
                });
            });
        });

    });
});

