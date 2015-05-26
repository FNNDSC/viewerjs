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
    gapi: 'https://apis.google.com/js/api',
    dicomParser: 'dicomParser/dist/dicomParser.min',
    fmjs: 'fmjs/src/js/fmjs',
    gcjs: 'gcjs/src/js/gcjs',
    xtk: '../lib/xtk',
    viewerjs: '../viewerjs'
  }
});

require(['gcjs', 'viewerjs'], function(cjs, viewerjs) {

  // Client ID from the Google's developer console
  var CLIENT_ID = '358010366372-o8clkqjol0j533tp6jlnpjr2u2cdmks6.apps.googleusercontent.com';
  var collaborator = new cjs.GDriveCollab(CLIENT_ID);


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


  // Event handler for the go! button
  var goButton = document.getElementById('gobutton');

  goButton.onclick = function() {
    var roomIdInput = document.getElementById('roomId');

    // update UI
    document.getElementById('inputcontainer').style.display = 'none';

    // Create a new viewerjs.Viewer object
    // A collaborator object is only required if we want to enable realtime collaboration.
    var view = new viewerjs.Viewer('viewercontainer', collaborator);
    view.startCollaboration(roomIdInput.value);
  };


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

    // update UI
    $('div.collab').css('display', 'none');
    dirBtn.disabled = true;

    // Create a new viewerjs.Viewer object
    // A collaborator object is only required if we want to enable realtime collaboration.
    var view = new viewerjs.Viewer('viewercontainer', collaborator);
    view.init(imgFileArr);
    view.addThumbnailBar();
    view.addToolBar();
  };

});
