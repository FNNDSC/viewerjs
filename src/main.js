require.config({
    baseUrl: 'js/components',
    paths: {
        // the left side is the module ID, the right side is the path to
        // the file, relative to baseUrl (relative to the directory of this config script).
        // Also, the path should NOT include the '.js' file extension.
        // This example is using jQuery located at
        // components/jquery/dist/jquery.min.js relative to the baseUrl.
        // It tries to load jQuery from Google's CDN first and falls back
        // to load locally
        jquery: ['https://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.min', 'jquery/dist/jquery.min'],
        jquery_ui: ['https://ajax.googleapis.com/ajax/libs/jqueryui/1.11.2/jquery-ui.min', 'jquery-ui/jquery-ui.min'],
        dicomParser: 'dicomParser/dist/dicomParser.min',
        xtk: '../lib/xtk',
        viewerjs: '../viewerjs'
    }
});


require(['viewerjs'], function(viewerjs) {

  // Event handler for the directory loader button
  var dirBtn = document.getElementById('dirbtn');

  dirBtn.onchange = function(e) {
    var files = e.target.files;
    var fileObj;
    // Source data array for the new Viewer object
    var imgFileArr = [];

    for (var i=0; i<files.length; i++) {
      fileObj = files[i];
      if ('webkitRelativePath' in fileObj) {
        fileObj.fullPath = fileObj.webkitRelativePath;
      } else if (!('fullPath' in fileObj)) {
        fileObj.fullPath = fileObj.name;
      }
      imgFileArr.push({
        'url': fileObj.fullPath,
        'file': fileObj
      });
    }

    // Create a new viewerjs.Viewer object
    var view = new viewerjs.Viewer(imgFileArr, 'viewercontainer');
    view.addThumbnailBar();
    view.addToolBar();
  };

});
