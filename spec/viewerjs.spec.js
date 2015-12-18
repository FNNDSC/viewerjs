/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['viewerjs'], function(viewerjs) {

  describe('viewerjs', function() {
    var view;

    // Append container div
    $(document.body).append('<div id="viewercontainer"></div>');


    beforeEach(function() {

      // Create a new viewerjs.Viewer object
      view = new viewerjs.Viewer('viewercontainer');
      
      view.init();
      view.addData([{'url': '/local.nii'}]);
    });

    afterEach(function() {

      // Destroy viewerjs.Viewer object
      view.destroy();
    });

    it('viewerjs.Viewer.prototype.getImgFileObject(0) returns image file object given its id',
      function () {
        expect(view.getImgFileObject(0).id).toEqual(0);
      }
    );

  });
});
