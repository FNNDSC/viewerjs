require.config({
    baseUrl: 'js',
    paths: {
        // the left side is the module ID, the right side is the path to
        // the file, relative to baseUrl.
        // Also, the path should NOT include the '.js' file extension.
        // This example is using jQuery located at
        // components/jquery/dist/jquery.min.js relative to the baseUrl.
        // It tries to load jQuery from Google's CDN first and falls back
        // to load locally
        jquery: ['https://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.min', 'components/jquery/dist/jquery.min'],
        jquery_ui: ['https://ajax.googleapis.com/ajax/libs/jqueryui/1.11.2/jquery-ui.min', 'components/jquery-ui/jquery-ui.min'],
        viewerjs: 'viewerjs.min'
    }
});

// 1st level dependencies
require(['jquery', 'jquery_ui'], function() {
  // 2nd level dependencies
  require(['viewerjs'], function() {

    // External App code here

  });
});
