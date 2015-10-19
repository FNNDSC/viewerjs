/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['viewerjs'], function(viewerjs) {
  var view;

  beforeEach(function() {

    // Create a new viewerjs.Viewer object
    document.body.innerHTML = '<div id="viewercontainer"></div>';
    view = new viewerjs.Viewer('viewercontainer');
    view._buildImgFileArr([{'url': '/local.nii'}]);
  });

  it('viewerjs.Viewer.prototype.getImgFileObject(0) returns image file object given its id',
    function () {
      expect(view.getImgFileObject(0).id).toEqual(0);
    });

});
