/**
 * This module implements the viewer's specification (tests).
 *
 */

define(['viewerjsPackage', 'jquery', 'jquery_ui'], function(viewerjs, $) {

  describe('viewerjs', function() {

    window.jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;

    var fileObjArr = [{url: 'mri_testdata/volumes/nii/s34654_df.nii', name: 's34654_df.nii',
      remote: true}];

    // append a container for the whole viewer
    var container = $('<div id="viewercontainer"></div>');
    $(document.body).append(container);

    var view; // viewer

    describe('viewerjs Initialization', function() {

      beforeEach(function() {

        // Create a new viewerjs.Viewer object
        view = new viewerjs.Viewer('viewercontainer');
      });

      afterEach(function() {

        // Destroy viewer
        view.destroy();
      });

      it('viewerjs.Viewer.prototype.addTrash adds a trash to the viewer',

        function() {

          view.addTrash();
          expect($('.view-trash', view.container).length).toEqual(1);
          expect(view.trash.length).toEqual(1);
        }
      );

      it('viewerjs.Viewer.prototype.addRenderersBox adds a renderers box to' +
        ' the viewer',

        function() {

          view.container.sortable();
          view.addRenderersBox();
          expect($('.view-renderers', view.container).length).toEqual(1);
          expect(view.rBox.container.length).toEqual(1);
        }
      );

      it('viewerjs.Viewer.prototype.addToolBar adds a toolbar to the viewer',

        function() {

          view.container.sortable();
          view.addRenderersBox(); // a renderers box must be added first
          view.addToolBar();
          expect($('.view-toolbar', view.container).length).toEqual(1);
          expect(view.toolBar.container.length).toEqual(1);
        }
      );

      it('viewerjs.Viewer.prototype.init initializes the viewer html',

        function() {

          view.init();
          expect(view.container.length).toEqual(1);
          expect(view.rBox.container.length).toEqual(1);
          expect(view.toolBar.container.length).toEqual(1);
        }
      );

      it('viewerjs.Viewer.prototype.buildImgFileArr builds viewer main data' +
        ' structure: view.imgFileArr',

        function() {

          var imgFileArr = view.buildImgFileArr(fileObjArr);

          expect(imgFileArr[0]).toEqual({
            id: 0,
            baseUrl: 'mri_testdata/volumes/nii/',
            imgType: 'vol',
            files: [{url: 'mri_testdata/volumes/nii/s34654_df.nii', name: 's34654_df.nii', remote: true}],
          });
        }
      );

      it('rendererjs.Renderer.prototype.addThumbnailsBar adds a new thumbnails' +
        ' bar to the viewer',

        function(done) {

          view.init();

          view.addThumbnailsBar(view.buildImgFileArr(fileObjArr), function() {

            expect($('.view-thumbnailsbar', view.container).length).toEqual(1);
            expect(view.thBars[0].container.length).toEqual(1);
            done();
          });
        }
      );

      it('rendererjs.Renderer.prototype.addData adds new data to the viewer',

        function(done) {

          view.init();

          view.addData(fileObjArr, function() {

            expect(view.imgFileArr[0]).toEqual({
              id: 0,
              thBarId: 0,
              baseUrl: 'mri_testdata/volumes/nii/',
              imgType: 'vol',
              files: [{url: 'mri_testdata/volumes/nii/s34654_df.nii', name: 's34654_df.nii', remote: true}],
            });

            expect($('.view-thumbnailsbar', view.container).length).toEqual(1);
            expect(view.thBars[0].container.length).toEqual(1);

            done();
          });
        }
      );
    });

    describe('viewerjs Behaviour', function() {

      beforeEach(function(done) {

        view = new viewerjs.Viewer('viewercontainer');

        view.init();

        view.addData(fileObjArr, function() {

          done();
        });
      });

      afterEach(function() {

        view.destroy();
      });

      it('rendererjs.Renderer.prototype.removeData removes data from the viewer',

        function() {

          view.removeData(0); // remove imgFileObj with id=0

          expect(view.imgFileArr[0]).toBeNull();
          expect(view.thBars[0]).toBeNull();
        }
      );

      it('rendererjs.Renderer.prototype.addRenderer adds a renderer to the' +
        ' viewer renderers box',

        function(done) {

          view.addRenderer(view.imgFileArr[0], function(rndr) {

            expect(view.rBox.renderers[0]).toBe(rndr);
            expect(rndr.selected).toEqual(true);

            done();
          });
        }
      );

      it('viewerjs.Viewer.prototype.getImgFileObject(id) returns image file object given its id',

        function() {

          expect(view.getImgFileObject(0).id).toEqual(0);
        }
      );

      it('viewerjs.Viewer.prototype.getThumbnailsBarObject(id) returns the' +
        'corresponding thumbnails bar object ',

        function() {

          expect(view.getThumbnailsBarObject(0)).toBe(view.thBars[0]);
        }
      );
    });
  });
});
