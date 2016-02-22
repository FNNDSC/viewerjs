require(['./config'], function() {

  require(['gcjsPackage', 'viewerjsPackage'], function(cjs, viewerjs) {

    // Client ID from the Google's developer console
    var CLIENT_ID = '1050768372633-ap5v43nedv10gagid9l70a2vae8p9nah.apps.googleusercontent.com';
    var collaborator = new cjs.GDriveCollab(CLIENT_ID);

    // Create a new viewerjs.Viewer object
    // A collaborator object is only required if we want to enable realtime collaboration.
    var view = new viewerjs.Viewer('viewercontainer', collaborator);

    // start the viewer
    view.init();

  });
});
