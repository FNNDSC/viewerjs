/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['viewerjs'], function(viewerjs) {

  describe('viewerjs', function() {
    var view;
    var rndr;

    // Append container div
    $(document.body).append('<div id="viewercontainer"></div>');

    beforeEach(function() {

      // Create a new viewerjs.Viewer object
      view = new viewerjs.Viewer('viewercontainer');

      view.init();
      view.addData([{'url': '/src/js/components/mri_testdata/volumes/nii/s34654_df.nii'}]);

      view.addRenderer(view.getImgFileObject(0), function(r) {

        rndr = r;
        done();
      });
    });

    afterEach(function() {

      // Destroy viewerjs.Viewer object
      view.destroy();
    });

    /*it('viewerjs.Viewer.prototype.getImgFileObject(id) returns image file object given its id',

      function() {

        expect(view.getImgFileObject(0).id).toEqual(0);
      });

    it('viewerjs.Viewer.prototype.addRenderer(imgFileObj) adds a new renderer',

      function() {

        var id = view.getImgFileObject(0).id;

        expect(view.rBox.getRendererContId(id)).toEqual(view.renderersIdPrefix + id);
      });*/

    it('viewerjs.Viewer.prototype.addRenderer(imgFileObj) adds a new volume',

        function() {

          //var id = view.getImgFileObject(0).id;
          /*var auxArr = view.rBox.renderers.filter(function(rndr) {

            return rndr.id === id;
          });*/

          expect(rndr).toBeNull();

          //expect(vol.filedata).toEqual(jasmine.any(Array));
        });

  });
});
