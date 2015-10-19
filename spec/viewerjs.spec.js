/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['gcjs', 'viewerjs'], function(cjs, viewerjs) {

  describe('viewerjs', function() {
    var view;

    beforeEach(function() {
      // Client ID from the Google's developer console
      var CLIENT_ID = '1050768372633-ap5v43nedv10gagid9l70a2vae8p9nah.apps.googleusercontent.com';
      var collaborator = new cjs.GDriveCollab(CLIENT_ID);
      // Create a new viewerjs.Viewer object
      // A collaborator object is only required if we want to enable realtime collaboration.
      $(document).append('<div id="viewercontainer"></div>');
      view = new viewerjs.Viewer('viewercontainer', collaborator);
      view.init([{url: 'local.nii'}]);
    });

    it('viewerjs.Viewer.prototype.getImgFileObject(0) returns image file object given its id',
      function () {
        expect(view.getImgFileObject(0)).toEqual(true);
      });
  });
});
