require.config({
  baseUrl: 'js/components',
  paths: {
    // The left side is the module ID, the right side is the path to the file relative
    // to baseUrl (which is in turn relative to the directory of this config script).
    // Also, the path should NOT include the '.js' file extension.
    // This example tries to load jQuery from Google's CDN first and if failure then falls
    // back to the local jQuery at jquery/dist/jquery.min.js relative to the baseUrl.
    //
    // Modules dicomParser, fmjs, gcjs, xtk and viewerjs are only needed in development mode.
    // They are no longer needed after building viewerjs.min.js.
    // jquery and jquery_ui are always required.
    jquery: ['https://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.min', 'jquery/dist/jquery.min'],
    jquery_ui: ['https://ajax.googleapis.com/ajax/libs/jqueryui/1.11.2/jquery-ui.min', 'jquery-ui/jquery-ui.min'],
    dicomParser: 'dicomParser/dist/dicomParser.min',
    fmjs: 'fmjs/src/js/fmjs',
    gcjs: 'gcjs/src/js/gcjs',
    xtk: '../lib/xtk',
    viewerjs: '../viewerjs'
  }
});


require(['viewerjs'], function(viewerjs) {

  // Event handler for the collab button
  $('#collabbutton').click( function() {
    $('.collab > .collab-input').slideToggle("fast");
    if ($(this).text()==='Hide collab window'){
      $(this).text('Enter existing collab room');
    } else {
      $(this).text('Hide collab window');
      $('#roomId').focus();
    }
  });

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
    var view = new viewerjs.Viewer('viewercontainer');
    view.init(imgFileArr);
    view.addThumbnailBar();
    view.addToolBar();
  };

});
