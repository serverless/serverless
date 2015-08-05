var assert = require("chai").assert,
    JAWS   = require('../../lib/main');

describe('deploy', function () {
    before(function (done) {
        this.timeout(0);  //dont timeout anything, creating tables, deleting tables etc
        done();
    });

    describe('test env', function (ddone) {
        this.timeout(0);

        it('successful', function (done) {
            this.timeout(0);

            JAWS.deploy("test", {});

            ////rochester, MN
            //weather
            //    .closestPlaces(44.0150757, -92.4775256, 30, 50000)
            //    .then(function (locations) {
            //        assert.deepEqual(locations, ['Blooming Prairie, MN',
            //            'Waltham, MN',
            //            'Hayfield, MN',
            //            'Claremont, MN',
            //            'Dodge Center, MN',
            //            'West Concord, MN',
            //            'Kenyon, MN',
            //            'Sargeant, MN',
            //            'Racine, MN',
            //            'Stewartville, MN',
            //            'Chatfield, MN',
            //            'Kasson, MN',
            //            'Mantorville, MN',
            //            'Byron, MN',
            //            'Rochester, MN',
            //            'Zumbrota, MN',
            //            'Pine Island, MN',
            //            'Oronoco, MN',
            //            'Mazeppa, MN',
            //            'Eyota, MN',
            //            'Dover, MN',
            //            'Viola, MN',
            //            'Elgin, MN',
            //            'Hammond, MN',
            //            'Zumbro Falls, MN',
            //            'Millville, MN',
            //            'Plainview, MN',
            //            'Theilman, MN']);
            //        done();
            //    })
            //    .catch(function (err) {
            //        console.error(err);
            //        done(err);
            //    });
        });

    });
});