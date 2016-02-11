/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['viewerjs'], function(viewerjs) {

  describe('viewerjs', function() {

    window.jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;

    /*var fileArr = [{url: 'volumes/nii/s34654_df.nii', name: 's34654_df.nii', remote: true},
      {'url': 'json/s34654_df.json', name: 's34654_df.json', 'remote': true}];*/

    // append a container for the whole viewer
    var container = $('<div id="viewercontainer"></div>');
    $(document.body).append(container);

    var view; // viewer

    describe('viewerjs test suit1', function() {

      beforeEach(function() {

        // Create a new viewerjs.Viewer object
        view = new viewerjs.Viewer('viewercontainer');
      });

      afterEach(function() {

        // Destroy viewer
        view.destroy();
      });

      it('viewerjs.Viewer.prototype.getImgFileObject(id) returns image file object given its id',

        function() {

          expect(view.getImgFileObject(0).id).toEqual(0);
        });
    });

    describe('viewerjs test suit2', function() {

      beforeEach(function() {

        view = new viewerjs.Viewer('viewercontainer');

        /*view.init(imgFileObj, function() {

          done();
        });*/
      });

      afterEach(function() {

        // Destroy renderer
        view.destroy();
      });

      it('viewerjs.Viewer.prototype.getImgFileObject(id) returns image file object given its id',

        function() {

          expect(view.getImgFileObject(0).id).toEqual(0);
        });

    });
  });
});
