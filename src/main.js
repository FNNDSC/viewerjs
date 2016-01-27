require.config({
  baseUrl: 'js/components',
  paths: {
    // The left side is the module ID, the right side is the path to the file relative
    // to baseUrl (which is in turn relative to the directory of this config script).
    // Also, the path should NOT include the '.js' file extension.
    // This example tries to load jQuery from Google's CDN first and if failure then falls
    // back to the local jQuery at jquery/dist/jquery.min.js relative to the baseUrl.
    //
    // All JS modules are needed in development mode. However the only modules needed after
    // building are jquery, jquery_ui and minimized viewerjs.

    jquery: ['https://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.min', 'jquery/dist/jquery.min'],
    jquery_ui: ['https://ajax.googleapis.com/ajax/libs/jqueryui/1.11.2/jquery-ui.min', 'jquery-ui/jquery-ui.min'],
    gapi: 'https://apis.google.com/js/api',
    jszip: 'jszip/dist/jszip',
    dicomParser: 'dicomParser/dist/dicomParser.min',
    utiljs: 'utiljs/src/js/utiljs',
    fmjs: 'fmjs/src/js/fmjs',
    gcjs: 'gcjs/src/js/gcjs',
    text: 'text/text',
    rendererjs: 'rendererjs/src/js/rendererjs',
    xtk: 'rendererjs/src/js/lib/xtk',
    jpegmin: 'rendererjs/src/js/lib/jpegmin',
    lossless: 'rendererjs/src/js/lib/lossless',
    jpx: 'rendererjs/src/js/lib/jpx',
    rboxjs: 'rboxjs/src/js/rboxjs',
    thbarjs: 'thbarjs/src/js/thbarjs',
    toolbarjs: 'toolbarjs/src/js/toolbarjs',
    referenceswin: 'chatjs/src/templates/referenceswin.html',
    chatjs: 'chatjs/src/js/chatjs',
    jqdlgext: 'chatjs/src/js/lib/jquery.dialogextend',
    viewerjs: '../viewerjs'
  }
});

require(['gcjs', 'viewerjs'], function(cjs, viewerjs) {

  // Client ID from the Google's developer console
  var CLIENT_ID = '1050768372633-ap5v43nedv10gagid9l70a2vae8p9nah.apps.googleusercontent.com';
  var collaborator = new cjs.GDriveCollab(CLIENT_ID);

  // Create a new viewerjs.Viewer object
  // A collaborator object is only required if we want to enable realtime collaboration.
  var view = new viewerjs.Viewer('viewercontainer', collaborator);

  // start the viewer
  view.init();

});
