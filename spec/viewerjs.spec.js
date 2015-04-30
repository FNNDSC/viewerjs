/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['viewerjs'], function(viewerjs) {
  describe('viewerjs', function() {
    it('viewerjs.strEndsWith(str, arrayOfStr) verifies if str ends with any of the strings in arrayOfStr',
      function () {
        expect(viewerjs.strEndsWith('testfile.txt', ['.txt'])).toEqual(true);
      });
  });
});
