var assert = require('assert');
var should = require('should');
var mongoose = require('mongoose');
var Model = require('../models/model.js').Model;
var sites = require('./fixtures/facilities.js');
var total = 0;

describe('Mongoose Quadtree Machine', function(done) {
    console.log('Testing basic functionailty, the standard use case.');
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
        it('should init a new model with no hiccups', function(done) {
            var model = new Model({name: 'Hello', coordinates: [1, 1] });
            model.save(function(err, model) {
                if (err) throw (err);
                done();
            });
            
        });

        it('should init the quadtree structure for Model', function(done) {
            Model.init()
                .then(function(anything, any) {
                    console.log(anything, any);
                    var QuadtreeModel = Model.QuadtreeModel;
                    QuadtreeModel.find({}).exec(function(err, sites) {
                        console.log(sites);
                        done();
                    });

                 });
        });

    });
});

