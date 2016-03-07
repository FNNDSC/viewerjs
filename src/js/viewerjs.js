/**
 * This module takes care of laying out all user interface (UI) components as well as
 * implementing realtime collaboration through the collaborator object injected into
 * viewerjs.Viewer constructor. The UI has a load button that allows to read a directory
 * tree (chrome) or multiple neuroimage files in the same directory (other browsers) for
 * their visualization and collaboration. Alternatively, users can directly drag in and
 * drop files/folders onto the viewer.
 */

// define a new module
define(
  [
  // bower components
  '../../../utiljs/src/js/utiljs',
  '../../../rendererjs/src/js/rendererjs',
  '../../../rboxjs/src/js/rboxjs',
  '../../../toolbarjs/src/js/toolbarjs',
  '../../../thbarjs/src/js/thbarjs',
  '../../../chatjs/src/js/chatjs',

  // html templates (requires the 'text' bower component)
  '../../../text/text!../templates/collabwin.html',

  // jquery is special because it is AMD but doesn't return an object
  'jquery_ui'

  ],function(util, render, rbox, toolbar, thbar, chat, collabwin) {

    /**
     * Provide a namespace for the viewer module
     *
     * @namespace
     */
    var viewerjs = viewerjs || {};

    /**
     * Class implementing the medical image viewer
     *
     * @constructor
     * @param {String} viewer's container's DOM id.
     * @param {Object} Optional collaborator object to enable realtime collaboration.
     */
    viewerjs.Viewer = function(containerId, collab) {

      this.version = 0.0;

      this.containerId = containerId;

      // viewer's container
      this.container = $('#' + containerId);

      // jQuery object for the trash
      this.trash = null;

      // jQuery object for the collaboration dialog window
      this.collabWin = null;

      // tool bar object
      this.toolBar = null;

      // renderers box object
      this.rBox = null;

      // thumbnails bars
      this.thBars = [];

      // array of objects containing the renderers box and thumbnails bars in their horizontal visual order
      this.componentsX = [];

      // array of image file objects, each object contains the following properties:
      //  -id: Integer, the object's id
      //  -baseUrl: String ‘directory/containing/the/files’
      //  -imgType: String neuroimage type. Any of the possible values returned by rendererjs.Renderer.imgType
      //  -files: Array of HTML5 File objects or custom file objects with properties:
      //     -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
      //     -url: the file's url
      //     -cloudId: the id of the file in a cloud storage system if stored in the cloud
      //     -name: file name
      //  The files array contains a single file for imgType different from 'dicom' or 'dicomzip'
      //  -thumbnail: Optional HTML5 File or custom file object (optional jpg file for a thumbnail image)
      //  -json: Optional HTML5 File or custom file object (optional json file with the mri info for imgType
      //         different from 'dicom')
      this.imgFileArr = [];

      //
      // collaborator object
      //
      if (collab) {

        this.collab = collab;

        // associated chat object
        this.chat = null;

        // Collaboration event listeners
        var self = this;

        // This is called when the collaboration has successfully started and is ready
        this.collab.onConnect = function(collaboratorInfo) {

          self.handleOnConnect(collaboratorInfo);
        };

        // This is called everytime the collaboration owner has shared data files with a new collaborator
        this.collab.onDataFilesShared = function(collaboratorInfo, fObjArr) {

          self.handleOnDataFilesShared(collaboratorInfo, fObjArr);
        };

        // This is called everytime the scene object is updated by a remote collaborator
        this.collab.onCollabObjChanged = function() {

          self.handleOnCollabObjChanged();
        };

        // This method is called when a new chat msg is received from a remote collaborator
        this.collab.onNewChatMessage = function(msgObj) {

          self.handleOnNewChatMessage(msgObj);
        };

        // This method is called everytime a remote collaborator disconnects from the collaboration
        this.collab.onDisconnect = function(collaboratorInfo) {

          self.handleOnDisconnect(collaboratorInfo);
        };
      }
    };

    /**
     * Initiliaze the UI's html.
     */
    viewerjs.Viewer.prototype.init = function() {
      var self = this;

      self.container.css({
        'position': 'relative',
        'margin': 0,
        '-webkit-box-sizing': 'border-box',
        '-moz-box-sizing': 'border-box',
        'box-sizing': 'border-box'

      }).sortable({ // a sortable viewer makes it possible for the thumbnails bars to move around
        zIndex: 9999,
        cursor: 'move',
        containment: 'parent',
        distance: '150',
        connectWith: '#' + self.containerId + ' .view-trash-sortable', // thumbnails bars can be trashed
        dropOnEmpty: true,

        start: function() {

          // trash doesn't show up during a realtime collaboration session
          if (!self.collab || !self.collab.collabIsOn) {

            self.trash.show();
          }
        },

        beforeStop: function(evt, ui) {

          var thBar;
          var parent = ui.placeholder.parent();

          if (self.trash.hasClass('highlight')) {

            self.trash.removeClass('highlight');
            // thumbnails bar was deposited on the trash so remove it and its related data

            for (var j = 0; j < self.thBars.length; j++) {

              // find the trashed thumbnails bar's object
              if (self.thBars[j].container[0] === ui.item[0]) {

                thBar = self.thBars[j];
                break;
              }
            }

            thBar.thumbnails.forEach(function(th) {

              if (th) {

                var id = thBar.getThumbnailId(th);
                self.removeData(id);
              }
            });

          } else if (parent[0] === self.container[0]) {

            // layout UI components (renderers box, thumbnails bars and toolbar)
            for (var i = 0; i < self.componentsX.length; i++) {

              if (self.componentsX[i].container[0] === ui.item[0]) {

                var target = self.componentsX.splice(i,1);

                if (ui.offset.left > ui.originalPosition.left) {

                  // moved from left to right so position it at the right end
                  self.componentsX = self.componentsX.concat(target);

                } else {

                  // moved from right to left so position it at the left end
                  self.componentsX = target.concat(self.componentsX);
                }

                self.layoutComponentsX();
                break;
              }
            }

          } else {

            // cancel ddRop
            $(evt.target).sortable('cancel');
          }

          self.trash.hide();
        }
      });

      self.addTrash();
      self.addRenderersBox();
      self.addToolBar();

      if (self.collab) { self.initCollabWindow(); }

      // set a dropzone
      util.setDropzone(self.container[0], function(fObjArr) {

        self.addData(fObjArr);
      });
    };

    /**
     * Add new data to the viewer. A new thumbnails bar is added to the UI for the new data.
     *
     * @param {Array} array of file objects. Each object contains the following properties:
     * -url:       String representing the file url
     * -file:      HTML5 File object (optional but neccesary when the files are gotten through a
     *             local filepicker or dropzone)
     * -cloudId:   String representing the file cloud id (optional but neccesary when the files
     *             are gotten from a cloud storage like GDrive)
     * -imgFObjId: Original image file object id (optional but neccesary when the files
     *             are gotten from a real-time collaboration session)
     * @param {Function} optional callback to be called when the viewer is ready.
     */
    viewerjs.Viewer.prototype.addData = function(fObjArr, callback) {
      var self = this;

      if (self.collab && self.collab.collabIsOn) {

        // no new data can be added during a realtime collaboration session so just call the callback
        if (callback) { callback(); }

      } else {

        if (fObjArr.length) {

          var imgFileArr = self.buildImgFileArr(fObjArr);

          self.addThumbnailsBar(imgFileArr, function() {

            if (callback) { callback(); }
          });

        } else {

          if (callback) { callback(); }
        }
      }
    };

    /**
     * Remove data from the viewer.
     *
     * @param {Number} image file object's integer id.
     */
    viewerjs.Viewer.prototype.removeData = function(id) {
      var self = this;

      // no data can be removed during a realtime collaboration session
      if (!self.collab || !self.collab.collabIsOn) {

        var thBar = self.getThumbnailsBarObject(id);

        if (thBar) {

          // remove corresponding thumbnail
          thBar.removeThumbnail(id);

          if (thBar.numThumbnails === 0) {

            // remove and destroy corresponding thumbnails bar if there is no thumbnail left

            var thBarCont = thBar.container;

            for (var j = 0; j < self.thBars.length; j++) {

              if (self.thBars[j].container[0] === thBarCont[0]) {

                self.thBars.splice(j, 1);
                break;
              }
            }

            for (j = 0; j < self.componentsX.length; j++) {

              if (self.componentsX[j].container[0] === thBarCont[0]) {

                self.componentsX.splice(j,1);
                break;
              }
            }

            thBar.destroy();
            thBarCont.remove();

            // recompute renderers box width
            self.rBox.container.css({width: self.computeRBoxCSSWidth()});

            self.layoutComponentsX();
          }

          // remove corresponding renderer in the renderers box if there is any
          var rArr = self.rBox.renderers.filter(function(el) {

            return el.id === id;
          });

          if (rArr.length) { self.rBox.removeRenderer(rArr[0]); }

          // remove the imgFileObj
          for (var i = 0; i < self.imgFileArr.length; i++) {

            if (self.imgFileArr[i].id === id) {

              self.imgFileArr.splice(i, 1);
              break;
            }
          }
        }
      }
    };

    /**
     * Build an array of image file objects (viewer's main data structure).
     *
     * @param {Array} array of file objects. Each object contains the following properties:
     * -url:       String representing the file url
     * -file:      HTML5 File object (optional but neccesary when the files are gotten through a
     *             local filepicker or dropzone)
     * -cloudId:   String representing the file cloud id (optional but neccesary when the files
     *             are gotten from a cloud storage like GDrive)
     * -imgFObjId: Original image file object id (optional but neccesary when the files
     *             are gotten from a real-time collaboration session)
     * @return {Array} array of image file objects, each object contains the following properties:
     *  -id: Integer, the object's id
     *  -baseUrl: String ‘directory/containing/the/files’
     *  -imgType: String neuroimage type. Any of the possible values returned by rendererjs.Renderer.imgType
     *  -files: Array of HTML5 File objects or custom file objects with properties:
     *     -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *     -url the file's url
     *     -cloudId: the id of the file in a cloud storage system if stored in the cloud
     *     -name: file name
     *  The files array contains a single file for imgType different from 'dicom' or 'dicomzip'
     *  -thumbnail: Optional HTML5 File or custom file object (optional jpg file for a thumbnail image)
     *  -json: Optional HTML5 File or custom file object (optional json file with the mri info for imgType different from 'dicom')
     */
    viewerjs.Viewer.prototype.buildImgFileArr = function(fObjArr) {
      var self = this;

      // define internal data structures
      var imgFileArr = [];
      var thumbnails = {}; // associative array of thumbnail image files
      var jsons = {}; // associative array of json files
      var dicoms = {}; // associative array of arrays with ordered DICOM files
      var dicomZips = {}; // associative array of arrays with zipped DICOM files
      var nonDcmData = []; // array of non-DICOM data
      var path, name;

      // function to add a file object into the proper internal data structure
      function addFile(fileObj) {

        var path = fileObj.url;
        var baseUrl = path.substring(0, path.lastIndexOf('/') + 1);
        var file;
        var imgType;
        var dashIndex;

        if (fileObj.file) {

          // get the HTML5 File object
          file = fileObj.file;

        } else {

          // build a dummy File object with a property remote
          file = {name: path.substring(path.lastIndexOf('/') + 1),
                 url: path,
                 remote: true};

          if (fileObj.cloudId) { file.cloudId = fileObj.cloudId; }

          if (fileObj.imgFObjId) { file.imgFObjId = fileObj.imgFObjId; }
        }

        imgType = render.Renderer.imgType(file);

        if (imgType === 'dicom') {

          if (!dicoms[baseUrl]) { dicoms[baseUrl] = []; }

          dicoms[baseUrl].push(file); // all dicoms with the same base url belong to the same volume

        } else if (imgType === 'dicomzip') {

          if (!dicomZips[baseUrl]) { dicomZips[baseUrl] = [];}

          dicomZips[baseUrl].push(file); // all dicom zip files with the same base url belong to the same volume

        } else if (imgType === 'thumbnail') {

          // save thumbnail file in an associative array
          // array keys are the full path up to the first dash in the file name or the last period
          dashIndex = path.indexOf('-', path.lastIndexOf('/'));

          if (dashIndex === -1) {

            thumbnails[path.substring(0, path.lastIndexOf('.'))] = file;

          } else {

            thumbnails[path.substring(0, dashIndex)] = file;
          }

        } else if (imgType === 'json') {

          // array keys are the full path with the extension trimmed
          jsons[path.substring(0, path.lastIndexOf('.'))] = file;

        } else if (imgType !== 'unsupported') {

          // push fibers, meshes, volumes into nonDcmData
          nonDcmData.push({
           'baseUrl': baseUrl,
           'imgType': imgType,
           'files': [file]
         });
        }
      }

      // function to assign utility files (thumbnail images or json files) to their corresponding
      // image file object in imgFileArr
      function assignUtilityFiles(files, filetype) {

        for (var key in files) {

          // Search for a neuroimage file with the same name as the current utility file
          for (var i = 0; i < imgFileArr.length; i++) {
            var j = 0;

            do {

              path = imgFileArr[i].baseUrl + imgFileArr[i].files[j].name;
              name = path.substring(0, path.lastIndexOf('.'));

            } while ((++j < imgFileArr[i].files.length)  && (key !== name));

            if (key === name) {

              imgFileArr[i][filetype] = files[key];
              break;
            }
          }
        }
      }

      // add files to proper internal data structures
      for (var i = 0; i < fObjArr.length; i++) {

        addFile(fObjArr[i]);
      }

      //
      // now build imgFileArr from the internal data structures
      //

      // push ordered DICOMs into imgFileArr
      for (var baseUrl in dicoms) {

        imgFileArr.push({
          'baseUrl': baseUrl,
          'imgType': 'dicom',
          'files': util.sortObjArr(dicoms[baseUrl], 'name')
        });
      }

      // push DICOM zip files into imgFileArr
      for (baseUrl in dicomZips) {

        imgFileArr.push({
          'baseUrl': baseUrl,
          'imgType': 'dicomzip',
          'files': util.sortObjArr(dicomZips[baseUrl], 'name')
        });
      }

      // push non-DICOM data into imgFileArr
      for (i = 0; i < nonDcmData.length; i++) {

        imgFileArr.push(nonDcmData[i]);
      }

      // add thumbnail images to imgFileArr
      assignUtilityFiles(thumbnails, 'thumbnail');

      // add json files to imgFileArr
      assignUtilityFiles(jsons, 'json');

      // assign an integer id to each array elem
      // if files came from a realtime collab session then use their original
      // imgFileObj's id from the collab owner
      if (typeof imgFileArr[0].files[0].imgFObjId === 'number') {

        for (i = 0; i < imgFileArr.length; i++) {

          imgFileArr[i].id = imgFileArr[i].files[0].imgFObjId;
        }

      } else {

        var maxId = -1;

        for (i = 0; i < self.imgFileArr.length; i++) {

          maxId = Math.max(maxId, self.imgFileArr[i].id);
        }

        ++maxId;

        for (i = 0; i < imgFileArr.length; i++) {

          imgFileArr[i].id = i + maxId;
        }
      }

      return imgFileArr;
    };

    /**
     * Append a trash box to the viewer.
     */
    viewerjs.Viewer.prototype.addTrash = function() {

      if (this.trash) {
        return; // trash already exists
      }

      this.trash = $('<div class="view-trash">' +
                        '<i class="fa fa-trash"></i>' +
                        ' <div class="view-trash-sortable"></div>' +
                      '</div>'
                    );

      this.container.append(this.trash);
    };

    /**
     * Append a renderers box to the viewer.
     */
    viewerjs.Viewer.prototype.addRenderersBox = function() {
      var self = this;

      if (self.rBox) {
        return; // renderers box already exists
      }

      // append a div container for the renderers box to the viewer
      var rBoxCont = $('<div></div>');
      self.container.append(rBoxCont);

      // renderers box options object
      var options = {
        container: rBoxCont[0],
        position: {
          bottom: 0,
          left: 0
        }
      };

      // check if there is a cloud file manager available
      var fileManager = null;
      if (self.collab) { fileManager = self.collab.fileManager; }

      // create a renderers box object
      self.rBox = new rbox.RenderersBox(options, fileManager);
      self.rBox.init();

      // the renderers box doesn't move around
      self.container.sortable('option', 'cancel', '.view-renderers');

      // Insert renderers box's in the array of components
      self.componentsX.push(self.rBox);

      //
      // renderers box event listeners
      //
      this.rBox.computeMovingHelper = function(evt, target) {

        var thWidth =  $('.view-thumbnail').css('width');
        var thHeight = $('.view-thumbnail').css('height');

        // corresponding thumbnail and renderer have the same integer id
        var id = self.rBox.getRendererId(target[0]);
        var thCont = self.getThumbnailsBarObject(id).getThumbnail(id);

        // the visually moving helper is a clone of the corresponding thumbnail
        return $(thCont).clone().css({
          display: 'block',
          width: thWidth,
          height: thHeight});
      };

      this.rBox.onStart = function() {

        // thumbnails bars' scroll bars have to be removed to make the moving helper visible
        self.thBars.forEach(function(thBar) {

          thBar.container.css({overflow: 'visible'});
        });
      };

      this.rBox.onBeforeStop = function(evt, ui) {

        var id = self.rBox.getRendererId(ui.item[0]);

        if (ui.placeholder.parent().parent()[0] === self.getThumbnailsBarObject(id).container[0]) {

          $(evt.target).sortable('cancel');

          var rArr = self.rBox.renderers.filter(function(el) {
              return el.id === id;
            });

          self.rBox.removeRenderer(rArr[0]);

        } else if (ui.placeholder.parent()[0] !== evt.target) {

          $(evt.target).sortable('cancel');
        }

        // restore thumbnails bars' scroll bars
        self.thBars.forEach(function(thBar) {

          thBar.container.css({overflow: 'auto'});
        });
      };

      this.rBox.onRendererChange = function(evt) {

        if ((evt.type === 'click')) {

          var selectedArr = this.getSelectedRenderers();

          var target = $(evt.currentTarget);

          if (target.hasClass('view-renderer-titlebar-buttonpane-pin')) {

            if (self.renderersLinked && selectedArr.length <= 1) {

              // at most one renderer is selected so change state to unlinked
              self.handleToolBarButtonLinkClick();

              if (selectedArr.length === 1) {

                selectedArr[0].select(); // reselect the only previously selected renderer
              }

            } else if (!self.renderersLinked && selectedArr.length === this.renderers.length) {

              // all renderers are selected so change state to linked
              self.handleToolBarButtonLinkClick();
            }
          }

          if (target.hasClass('view-renderer-titlebar-buttonpane-maximize')) {

            if (!self.renderersLinked && selectedArr.length === this.renderers.length) {

              // all renderers are selected so change state to linked
              self.handleToolBarButtonLinkClick();
            }
          }
        }

        self.updateCollabScene();
      };

      this.rBox.onRendererRemove = function(id) {

        self.handleOnRendererRemove(id);
        self.updateCollabScene();
      };
    };

    /**
     * Add a renderer to the renderers box.
     *
     * @param {Object} image file object with the following properties:
     *  -id: Integer id
     *  -baseUrl: String ‘directory/containing/the/files’
     *  -imgType: String neuroimage type. Any of the possible values returned by rendererjs.Renderer.imgType
     *  -files: Array of HTML5 File objects or custom file objects with properties:
     *     -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *     -url the file's url
     *     -cloudId: the id of the file in a cloud storage system if stored in the cloud
     *     -name: file name
     *  The files array contains a single file for imgType different from 'dicom' or 'dicomzip'
     *  -json: Optional HTML5 or custom File object (optional json file with the mri info for imgType different from 'dicom')
     * @param {Function} optional callback whose argument is the renderer object or null.
     */
    viewerjs.Viewer.prototype.addRenderer = function(imgFileObj, callback) {
      var self = this;

      var thBar = self.getThumbnailsBarObject(imgFileObj.id);

      $(thBar.getThumbnail(imgFileObj.id)).css({display: 'none'});

      self.rBox.addRenderer(imgFileObj, 'Z', function(renderer) {

        if (renderer) {

          // deselect all renderers in the UI
          self.rBox.renderers.forEach(function(rndr) {

            if (rndr.selected) { rndr.deselect(); }
          });

          // select the newly added renderer
          renderer.select();

          if (self.rBox.numOfRenderers === 2) {

            // if there are now 2 renderers in the renderers box then show the Link views button
            self.toolBar.showButton('link');
          }

        } else {

          // could not add renderer so restore the corresponding thumbnail
          $(thBar.getThumbnail(imgFileObj.id)).css({display: 'block'});
        }

        if (callback) { callback(renderer); }
      });
    };

    /**
     * Handle the renderers box's onRendererRemove event.
     *
     * @param {Number} renderer's integer id.
     */
    viewerjs.Viewer.prototype.handleOnRendererRemove = function(id) {

      var thBar = this.getThumbnailsBarObject(id);

      if (thBar) {

        // corresponding thumbnail and renderer have the same integer id
        var thCont = thBar.getThumbnail(id);

        // display the removed renderer's thumbnail
        $(thCont).css({display: 'block'});
      }

      // if there is now a single renderer then hide the Link views button and make it selected
      if (this.rBox.numOfRenderers === 1) {

        this.toolBar.hideButton('link');

        if (this.renderersLinked) {

          // unlink renderers
          this.handleToolBarButtonLinkClick();
        }

        var rndr = this.rBox.renderers[0];
        if (!rndr.selected) { rndr.select(); }
      }
    };

    /**
     * Create and add a toolbar to the viewer.
     */
    viewerjs.Viewer.prototype.addToolBar = function() {
      var self = this;

      if (self.toolBar) {
        return; // tool bar already exists
      }

      // append a div container for the toolbar to the viewer
      var toolBarCont = $('<div></div>');
      self.container.append(toolBarCont);

      // the toolbar doesn't move around
      self.container.sortable('option', 'cancel', '.view-toolbar');

      // toolbar options object
      var options = {
        container: toolBarCont[0],
        position: {
          top: '5px',
          left: 0
        }
      };

      // create a tool bar object
      self.toolBar = new toolbar.ToolBar(options);
      self.toolBar.init();

      //
      // add buttons to the tool bar
      //

      //
      // Load directory
      self.toolBar.addButton({
        id: 'load',
        title: 'Load data',
        caption: '<i class="fa fa-folder-open"></i>  <input type="file"' +
          '  webkitdirectory="" multiple style="display:none">',
        label: 'Load',

        onclick: function() {

          var loadFiles = function(e) {

            var files = e.target.files;
            var fileObj;

            // Source data array for the new Viewer object
            var imgFileArr = [];

            for (var i = 0; i < files.length; i++) {

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

            self.addData(imgFileArr);
          };

          var loadButton = $('input', this);

          loadButton[0].value = null; // makes possible to load the same file

          loadButton.off('change').on('change', loadFiles);

          loadButton[0].click(function(event) {

            event.stopPropagation();
          });
        }
      });

      //
      // X orientation button
      self.toolBar.addButton({
        id: 'acquisitionX',
        title: 'acquisitionX',
        caption: 'X',
        label: 'Orientation',
        onclick: function() {

          self.handleChangeOrientation('X');
          self.updateCollabScene();
        }
      });

      //
      // Y orientation button
      self.toolBar.addButton({
        id: 'acquisitionY',
        title: 'acquisitionY',
        caption: 'Y',
        onclick: function() {

          self.handleChangeOrientation('Y');
          self.updateCollabScene();
        }
      });

      //
      // Z orientation button
      self.toolBar.addButton({
        id: 'acquisitionZ',
        title: 'acquisitionZ',
        caption: 'Z',
        onclick: function() {

          self.handleChangeOrientation('Z');
          self.updateCollabScene();
        }
      });

      //
      // Fiducial widget button
      self.toolBar.addButton({
        id: 'fiducial',
        title: 'Add fiducial',
        caption: '<i class="fa fa-thumb-tack"></i>',
        label: 'Tools',
        onclick: function() {

          window.console.log('hi fiducial there...');

        }
      });

      self.toolBar.disableButton('fiducial');
      self.toolBar.hideButton('fiducial');
      self.toolBar.getButton('fiducial').label.css({display: 'none'});

      //
      // Distance widget button
      self.toolBar.addButton({
        id: 'distance',
        title: 'Measure distance',
        caption: '<i class="fa fa-arrows-h"></i>',
        onclick: function() {

          window.console.log('hi distance there...');

        }
      });

      self.toolBar.disableButton('distance');
      self.toolBar.hideButton('distance');

      //
      // Angle widget button
      self.toolBar.addButton({
        id: 'angle',
        title: 'Measure angle',
        caption: '<i class="fa fa-rss"></i>',
        onclick: function() {

          window.console.log('hi angle there...');

        }
      });

      self.toolBar.disableButton('angle');
      self.toolBar.hideButton('angle');

      //
      // Note widget button
      self.toolBar.addButton({
        id: 'note',
        title: 'Add a note',
        caption: '<i class="fa fa-sticky-note-o"></i>',
        onclick: function() {

          window.console.log('hi note there...');

        }
      });

      self.toolBar.disableButton('note');
      self.toolBar.hideButton('note');

      //
      // Pointer interactor button
      self.toolBar.addButton({
        id: 'pointer',
        title: 'Pointer',
        caption: '<i class="fa fa-mouse-pointer"></i>',
        label: 'Interactors',
        onclick: function() {

          window.console.log('hi zoom there...');

        }
      });

      self.toolBar.disableButton('pointer');
      self.toolBar.hideButton('pointer');
      self.toolBar.getButton('pointer').label.css({display: 'none'});

      //
      // Zoom interactor button
      self.toolBar.addButton({
        id: 'search',
        title: 'Zoom',
        caption: '<i class="fa fa-search"></i>',
        onclick: function() {

          window.console.log('hi zoom there...');

        }
      });

      self.toolBar.disableButton('search');
      self.toolBar.hideButton('search');

      //
      // Window Level interactor button
      self.toolBar.addButton({
        id: 'adjust',
        title: 'Window Level',
        caption: '<i class="fa fa-adjust"></i>',
        onclick: function() {

          window.console.log('hi window level there...');

        }
      });

      self.toolBar.disableButton('adjust');
      self.toolBar.hideButton('adjust');

      //
      // Pan interactor button
      self.toolBar.addButton({
        id: 'arrows',
        title: 'Pan',
        caption: '<i class="fa fa-arrows"></i>',
        onclick: function() {

          window.console.log('hi pan there...');

        }
      });

      self.toolBar.disableButton('arrows');
      self.toolBar.hideButton('arrows');

      //
      // Start collaboration button
      if (self.collab) {

        // collab button is added only when there is a collab object available
        self.toolBar.addButton({

          id: 'collab',
          title: 'Start collaboration',
          caption: '<i class="fa fa-users"></i>',
          label: 'More',
          onclick: function() {

            if (self.collab.collabIsOn) {

              self.leaveCollaboration();

            } else {

              self.startCollaboration();
            }
          }
        });
      }

      //
      // Link views button
      self.toolBar.addButton({
        id: 'link',
        title: 'Link views',
        caption: '<i class="fa fa-link"></i>',

        onclick: function() {

          self.handleToolBarButtonLinkClick();
          self.updateCollabScene();
        }
      });

      self.toolBar.hideButton('link');

      //
      // Settings button
      self.toolBar.addButton({
        id: 'gear',
        title: 'Settings',
        caption: '<i class="fa fa-gear"></i>',
        onclick: function() {

          window.open('https://github.com/FNNDSC/viewerjs/wiki');

        }

      });

      self.toolBar.disableButton('gear');
      self.toolBar.hideButton('gear');

      //
      // Help button
      self.toolBar.addButton({
        id: 'help',
        title: 'Wiki help',
        caption: '<i class="fa fa-question"></i>',
        onclick: function() {

          window.open('https://github.com/FNNDSC/viewerjs/wiki');

        }
      });

      //
      // toolbar event listeners
      //
      this.handleChangeOrientation = function(orientation) {

        self.rBox.getSelectedRenderers().forEach(function(rndr) {

          rndr.changeOrientation(orientation);
        });
      };

      this.handleToolBarButtonLinkClick = function() {

        if (self.renderersLinked) {

          self.rBox.unlinkRenderers();
          self.renderersLinked = false;

        } else {

          self.rBox.linkRenderers();
          self.renderersLinked = true;
        }

        self.toggleToolbarButtonActivation('link');
      };

      // make space for the toolbar
      var renderersTopEdge = parseInt(self.toolBar.container.css('top')) + parseInt(self.toolBar.container.css('height')) + 5;
      self.rBox.container.css({top: renderersTopEdge + 'px'});
      self.rBox.container.css({height: 'calc(100% - ' + renderersTopEdge + 'px)'});
    };

    /**
     * Toggle a toolbar's button activated/deactivated UI state.
     */
    viewerjs.Viewer.prototype.toggleToolbarButtonActivation = function(btnId) {

      var btnObj = this.toolBar.getButton(btnId);

      if (btnObj) {

        var btn = btnObj.button;

        if (btnObj.activated) {

          // deactivate the button

          btnObj.activated = false;
          btn.removeClass('active');

          if (btnId === 'collab') {

            btn.attr('title', 'Start collaboration');

          } else if (btnId === 'link') {

            btn.attr('title', 'Link views');
          }

        } else {

          // activate the button

          btnObj.activated = true;
          btn.addClass('active');

          if (btnId === 'collab') {

            btn.attr('title', 'End collaboration');

          } else if (btnId === 'link') {

            btn.attr('title', 'Unlink views');
          }
        }
      }
    };

    /**
     * Initilize collaboration window's HTML and event handlers.
     */
    viewerjs.Viewer.prototype.initCollabWindow = function() {
      var self = this;

      self.collabWin = $('<div></div>');

      // convert the previous div into a floating window with a close button
      self.collabWin.dialog({
        title: 'Start collaboration',
        modal: true,
        autoOpen: false,
        minHeight: 300,
        height: 350,
        minWidth: 550,
        width: 600
      });

      // add contents to the floating window from its HTML template
      self.collabWin.append($(collabwin).filter('.view-collabwin'));
    };

    /**
     * Create and add a thumbnails bar to the viewer.
     *
     * @return {Array} array of image file objects, each object contains the following properties:
     *  -id: Integer, the object's id
     *  -baseUrl: String ‘directory/containing/the/files’
     *  -imgType: String neuroimage type. Any of the possible values returned by rendererjs.Renderer.imgType
     *  -files: Array of HTML5 File objects or custom file objects with properties:
     *     -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *     -url the file's url
     *     -cloudId: the id of the file in a cloud storage system if stored in the cloud
     *     -name: file name
     *  The files array contains a single file for imgType different from 'dicom' or 'dicomzip'
     *  -thumbnail: Optional HTML5 File or custom file object (optional jpg file for a thumbnail image)
     * @param {Function} optional callback to be called when the thumbnails bar is ready.
     */
    viewerjs.Viewer.prototype.addThumbnailsBar = function(imgFileArr, callback) {
      var self = this;

      if (!imgFileArr.length) {

        if (callback) { callback(); }
        return;
      }

      // append a div container for the thumbnails bar to the viewer
      var thBarCont = $('<div></div>');
      self.container.append(thBarCont);

      // thumbnails bar's options object
      var options = {
        container: thBarCont[0],
        position: {
          top: self.rBox.container.css('top'), // thumbnails bar at the same vertical level as the renderers box
          left: '5px'
        },
        layout: 'vertical'
      };

      // check if there is a cloud file manager available
      var fileManager = null;
      if (self.collab) { fileManager = self.collab.fileManager; }

      // create the thumbnails bar object
      var thBar = new thbar.ThumbnailsBar(options, fileManager);

      thBar.init(imgFileArr, function() {

        // hide any thumbnail with a corresponding renderer (same integer id) already added to the renderers box
        for (var i = 0; i < self.rBox.renderers.length; i++) {

          // corresponding thumbnail and renderer have the same integer id
          var id = self.rBox.renderers[i].id;
          var thCont = thBar.getThumbnail(id);

          $(thCont).css({display: 'none'});
        }

        if (callback) { callback(); }
      });

      // get the jQuery sortable for the trash element
      $('.view-trash-sortable', self.trash).sortable({

        over: function() {

          self.trash.addClass('highlight');
        },

        out: function() {

          self.trash.removeClass('highlight');
        }
      });

      // link the thumbnails bar with the renderers box
      var viewerSelector = '#' + self.containerId;
      self.rBox.setComplementarySortableElems(viewerSelector + ' .view-thumbnailsbar-sortable');
      thBar.setComplementarySortableElems(viewerSelector + ' .view-renderers');

      // link the thumbnails bar with the trash's sortable element
      thBar.jqSortable.sortable('option', 'connectWith', viewerSelector + ' .view-renderers, ' +
        viewerSelector + ' .view-trash-sortable');

      //
      // thumbnails bar event listeners
      //
      thBar.onBeforeStop = function(evt, ui) {

        var id = thBar.getThumbnailId(ui.item[0]);
        var parent = ui.placeholder.parent();

        if (self.trash.hasClass('highlight')) {

          self.trash.removeClass('highlight');

          $(evt.target).sortable('cancel');
          self.removeData(id);

        } else if (parent[0] === self.rBox.container[0]) {

          $(evt.target).sortable('cancel');

          // add the corresponding renderer (with the same integer id) to the UI
          self.addRenderer(self.getImgFileObject(id), function(renderer) {

            if (renderer) {

              self.updateCollabScene();
            }
          });

        } else if (parent[0] !== thBar.jqSortable[0]) {

          // cancel ddRop
          $(evt.target).sortable('cancel');
        }

        self.trash.hide();
      };

      thBar.onStart = function() {

        // trash doesn't show up during a realtime collaboration session
        if (!self.collab || !self.collab.collabIsOn) {

          self.trash.show();
        }
      };

      // append a thumbnails bar id to each array elem
      //
      var thBarId = -1;

      for (var i = 0; i < self.thBars.length; i++) {

        thBarId = Math.max(thBarId, self.thBars[i].id);
      }

      thBar.id = ++thBarId;

      for (i = 0; i < imgFileArr.length; i++) {

        imgFileArr[i].thBarId = thBarId;
      }

      // add the new data array to the viewer's main array
      self.imgFileArr = self.imgFileArr.concat(imgFileArr);

      // push thumbnails bar in the array of thumbnails bar object
      self.thBars.push(thBar);

      // insert thumbnails bar in front of the array of horizontal components
      self.componentsX.unshift(thBar);

      self.rBox.container.css({width: self.computeRBoxCSSWidth()});

      self.layoutComponentsX();
    };

    /**
     * Compute CSS width of the viewer's renderers box.
     *
     * @return {String} CSS width string.
     */
    viewerjs.Viewer.prototype.computeRBoxCSSWidth = function() {

      var nTh = this.thBars.length;
      var rBoxCSSWidth;

      if (nTh) {

        var thBarSpace = parseInt(this.thBars[0].container.css('width')) + 10;
        rBoxCSSWidth = 'calc(100% - ' + (thBarSpace * nTh) + 'px)';

      } else {

        rBoxCSSWidth = '100%';
      }

      return rBoxCSSWidth;
    };

    /**
     * Layout viewer's components along the horizontal axis.
     */
    viewerjs.Viewer.prototype.layoutComponentsX = function() {
      var self = this;

      var left = 5;
      var right = 0;
      var rBIx;

      // find the position of the renderers box
      for (var i = 0; i < self.componentsX.length; i++) {

        if (self.componentsX[i].renderers) {
          rBIx = i;
          break;
        }
      }

      // position elements to the left of the renderers box including it
      var comps = self.componentsX.slice(0, rBIx + 1);

      comps.forEach(function(el) {

        el.container.css({left: left + 'px', right: 'auto'});
        left += parseInt(el.container.css('width')) + 5 ;
      });

      // position  elements to the right of the renderers box
      comps = self.componentsX.slice(rBIx + 1);

      comps.reverse().forEach(function(el) {

        el.container.css({left: 'auto', right: right + 'px'});
        right += parseInt(el.container.css('width')) + 5 ;
      });
    };

    /**
     * Return image file object given its id.
     *
     * @param {Number} Integer number for the image file object's id.
     * @return {Object} null or image file object with the following properties:
     *  -id: Integer id
     *  -baseUrl: String ‘directory/containing/the/files’
     *  -imgType: String neuroimage type. Any of the possible values returned by rendererjs.Renderer.imgType
     *  -files: Array of HTML5 File objects or custom file objects with properties:
     *     -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *     -url the file's url
     *     -cloudId: the id of the file in a cloud storage system if stored in the cloud
     *     -name: file name
     *  The files array contains a single file for imgType different from 'dicom' or 'dicomzip'
     *  -thumbnail: Optional HTML5 File or custom file object (optional jpg file for a thumbnail image)
     *  -json: Optional HTML5 or custom File object (optional json file with the mri info for imgType different from 'dicom')
     */
    viewerjs.Viewer.prototype.getImgFileObject = function(id) {

      var arr = this.imgFileArr.filter(function(imgFileObj) {

        return imgFileObj.id === id;
      });

      if (arr.length) { return arr[0]; }

      return null;
    };

    /**
     * Given an image file object id get the thumbnails bar object that contains the associated thumbnail image.
     *
     * @param {Number} Integer number for the image file object's id.
     * @return {Object} thumbnails bar object or null.
     */
    viewerjs.Viewer.prototype.getThumbnailsBarObject = function(id) {

      var imgFileObj = this.getImgFileObject(id);

      if (!imgFileObj) { return null; }

      var arr = this.thBars.filter(function(thB) {

        return thB.id === imgFileObj.thBarId;
      });

      return arr[0];
    };

    /**
     * Render the current scene.
     */
    viewerjs.Viewer.prototype.renderScene = function() {
      var self = this;

      if (self.collab && self.collab.collabIsOn) {

        // collaboration is on, so get and render the scene
        var scene = self.getCollabScene();
        var renderers2DIds = [];
        var renderers2DProps = [];
        var numOfUpdatedRenderers = 0;

        //
        // render the renderers in the renderers box
        //
        var updateRenderer = function(rObj) {

          var r2DProps = renderers2DProps[renderers2DIds.indexOf(rObj.id)];

          // update the volume properties
          rObj.volume.lowerThreshold = r2DProps.volume.lowerThreshold;
          rObj.volume.upperThreshold = r2DProps.volume.upperThreshold;
          rObj.volume.windowLow = r2DProps.volume.lowerWindowLevel;
          rObj.volume.windowHigh = r2DProps.volume.upperWindowLevel;
          rObj.volume.indexX = r2DProps.volume.indexX;
          rObj.volume.indexY = r2DProps.volume.indexY;
          rObj.volume.indexZ = r2DProps.volume.indexZ;

          // update the camera
          var obj = JSON.parse(r2DProps.renderer.viewMatrix);
          var arr = $.map(obj, function(el) { return el; });
          rObj.renderer.camera.view = new Float32Array(arr);

          // update the flip orientation
          rObj.renderer.flipColumns = r2DProps.renderer.flipColumns;
          rObj.renderer.flipRows = r2DProps.renderer.flipRows;

          // update the orientation
          if (rObj.renderer.orientation !== r2DProps.renderer.orientation) {

            self.handleChangeOrientation(r2DProps.renderer.orientation);
          }

          // update the pointing position
          rObj.renderer.pointer = r2DProps.renderer.pointer;

          // update the slice info HTML
          rObj.updateUISliceInfo();

          // check if all renderers have been updated
          if (++numOfUpdatedRenderers === renderers2DIds.length) {

            // update the renderers' window state
            self.rBox.renderers.forEach(function(rObj) {

              var r2DProps = renderers2DProps[renderers2DIds.indexOf(rObj.id)];

              if (rObj.selected !== r2DProps.selected) {

                if (rObj.selected) {

                  rObj.deselect();

                } else {

                  rObj.select();
                }
              }
            });

            if (self.renderersLinked !== scene.toolBar.renderersLinked) {

              self.handleToolBarButtonLinkClick();
            }
          }
        };

        // get the collab scene's 2D renderer ids
        scene.renderers.forEach(function(rInfo) {

          if (rInfo.general.type = '2D') {

            renderers2DIds.push(rInfo.general.id);
            renderers2DProps.push(rInfo);
          }
        });

        // remove the 2D renderers from the local scene that were removed from the collab scene
        self.rBox.renderers.forEach(function(rObj) {

          if (renderers2DIds.indexOf(rObj.id) === -1) {

            self.rBox.removeRenderer(rObj);
          }
        });

        // add 2D renderers to the local scene that were added to the collab scene
        renderers2DIds.forEach(function(id) {

          self.addRenderer(self.getImgFileObject(id), updateRenderer);
        });
      }
    };

    /**
     * Create and return a scene object describing the current scene.
     */
    viewerjs.Viewer.prototype.getLocalScene = function() {

      var scene = {};

      // set toolbar's properties
      scene.toolBar = {};
      scene.toolBar.renderersLinked = this.renderersLinked;

      // set renderers' properties
      // https://docs.google.com/document/d/1GHT7DtSq1ds4TyplA0E2Efy4fuv2xf17APcorqzBZjc/edit
      scene.renderers = [];

      // parse each renderer and get information to be synchronized
      for (var j = 0; j < this.rBox.renderers.length; j++) {

        var rObj = this.rBox.renderers[j];
        var rInfo = {};

        // set general information about the renderer
        rInfo.general = {};
        rInfo.general.id = rObj.id;
        rInfo.general.type = '2D';

        // set renderer specific information
        rInfo.renderer = {};
        rInfo.renderer.viewMatrix = JSON.stringify(rObj.renderer.camera.view);
        rInfo.renderer.flipColumns = rObj.renderer.flipColumns;
        rInfo.renderer.flipRows = rObj.renderer.flipRows;
        rInfo.renderer.pointer = rObj.renderer.pointer;
        rInfo.renderer.orientation = rObj.renderer.orientation;

        // set volume specific information
        // only supports 1 volume for now....
        rInfo.volume = {};
        rInfo.volume.file = rObj.volume.file;
        rInfo.volume.lowerThreshold = rObj.volume.lowerThreshold;
        rInfo.volume.upperThreshold = rObj.volume.upperThreshold;
        rInfo.volume.lowerWindowLevel = rObj.volume.windowLow;
        rInfo.volume.upperWindowLevel = rObj.volume.windowHigh;
        rInfo.volume.indexX = rObj.volume.indexX;
        rInfo.volume.indexY = rObj.volume.indexY;
        rInfo.volume.indexZ = rObj.volume.indexZ;

        // set interactor specific information
        rInfo.interactor = {};

        // set camera specific information
        rInfo.camera = {};

        // set pointer specific information
        rInfo.pointer = {};

        // renderer window's state
        rInfo.selected = rObj.selected;

        scene.renderers.push(rInfo);
      }

      return scene;
    };

    /**
     * Return the current collaboration scene object.
     */
    viewerjs.Viewer.prototype.getCollabScene = function() {

      if (this.collab && this.collab.collabIsOn) {

        return this.collab.getCollabObj();
      }
    };

    /**
     * Update the collaboration scene.
     */
    viewerjs.Viewer.prototype.updateCollabScene = function() {

      // if collaboration is on then update the collaboration scene
      if (this.collab && this.collab.collabIsOn) {

        var newScene = this.getLocalScene();
        this.collab.setCollabObj(newScene);
      }
    };

    /**
     * Start the realtime collaboration.
     */
    viewerjs.Viewer.prototype.startCollaboration = function() {
      var self = this;

      if (self.collab) {

        self.collabWin.dialog('open');

        var startCollaboration = function() {

          var roomIdInput = $('.view-collabwin-input input', self.collabWin)[0];

          if (roomIdInput.value) {

            // wipe current visualization
            self.cleanUI();

            // start the collaboration as an additional collaborator
            self.collab.joinRealtimeCollaboration(roomIdInput.value);

          } else {

            // start as the collaboration owner
            self.collab.startRealtimeCollaboration(self.getLocalScene());
          }

          self.collabWin.dialog('close');
          self.toolBar.disableButton('collab');
        };

        self.collab.authorizeAndLoadApi(true, function(granted) {

          var goButton = $('.view-collabwin-input button', self.collabWin)[0];

          if (granted) {

            // realtime API ready
            goButton.onclick = function() {

              startCollaboration();
            };

          } else {

            goButton.onclick = function() {

              self.collab.authorizeAndLoadApi(false, function(granted) {

                if (granted) {

                  // realtime API ready
                  startCollaboration();
                }
              });
            };
          }
        });

      } else {

        console.error('Collaboration was not enabled for this viewer instance');
      }
    };

    /**
     * Start the realtime collaboration's chat.
     */
    viewerjs.Viewer.prototype.startCollaborationChat = function() {

      if (this.collab && this.collab.collabIsOn) {

        this.chat = new chat.Chat(this.collab);
        this.chat.init();
      }
    };

    /**
     * Leave the realtime collaboration.
     */
    viewerjs.Viewer.prototype.leaveCollaboration = function() {

      if (this.collab && this.collab.collabIsOn) {

        this.collab.leaveRealtimeCollaboration();

        // update the toolbar's UI
        this.toggleToolbarButtonActivation('collab');
        this.toolBar.enableButton('load');
        this.toolBar.enableButton('book');

        // destroy the chat object
        this.chat.destroy();
        this.chat = null;
      }
    };

    /**
     * Handle the onConnect event when the collaboration has successfully started and is ready.
     *
     * @param {Obj} new collaborator info object.
     */
    viewerjs.Viewer.prototype.handleOnConnect = function(collaboratorInfo) {
      var self = this;

      // total number of files to be uploaded to GDrive
      var totalNumFiles = (function() {
        var nFiles = 0;

        for (var i = 0; i < self.imgFileArr.length; i++) {

          ++nFiles;
          if (self.imgFileArr[i].json) { ++nFiles; }
        }

        return nFiles;
      }());

      // callback to load a file into GDrive
      var fObjArr = [];
      var loadFile = function(fInfo, fData) {

        function writeToGdrive(info, data) {

          var name = info.url.substring(info.url.lastIndexOf('/') + 1);

          self.collab.fileManager.writeFile(self.collab.dataFilesBaseDir + '/' + name, data, function(fileResp) {

            fObjArr.push({
              id: fileResp.id,
              url: info.url,
              thBarId: info.thBarId,
              imgFObjId: info.imgFObjId
            });

            if (fObjArr.length === totalNumFiles) {

              // all data files have been uploaded to GDrive
              self.collab.setDataFileList(fObjArr);
            }
          });
        }

        if (fInfo.url.search(/.dcm.zip$|.ima.zip$|.zip$/i) !== -1) {

          // fData is an array of arrayBuffer so instead of one file now fData.length files need to be uploaded
          totalNumFiles += fData.length - 1;
          writeToGdrive(fInfo, fData[0]);

          for (var j = 1; j < fData.length; j++) {

            fInfo.url = fInfo.url.replace(/.dcm.zip$|.ima.zip$|.zip$/i, j + '$&');
            writeToGdrive(fInfo, fData[j]);
          }

        } else {

          // fData is just a single arrayBuffer
          writeToGdrive(fInfo, fData);
        }
      };

      if (self.collab.collaboratorInfo.id === collaboratorInfo.id) {

        // local on connect

        if (self.collab.collabOwner) {

          self.toolBar.enableButton('collab');

          // update the toolbar's UI
          self.toggleToolbarButtonActivation('collab');
          self.toolBar.disableButton('load');
          self.toolBar.disableButton('book');

          // asyncronously load all files to GDrive
          self.collab.fileManager.createPath(self.collab.dataFilesBaseDir, function() {

            // create a rendererjs.Renderer object to use its methods
            var r = new render.Renderer({container: null}, self.collab);

            for (var i = 0; i < self.imgFileArr.length; i++) {

              var imgFileObj = self.imgFileArr[i];
              var thBarId = imgFileObj.thBarId;
              var imgFObjId = imgFileObj.id;
              var url;

              if (imgFileObj.json) {

                url = imgFileObj.baseUrl + imgFileObj.json.name;
                r.readFile(imgFileObj.json, 'readAsArrayBuffer',
                  loadFile.bind(null, {url: url, thBarId: thBarId, imgFObjId: imgFObjId}));
              }

              if (imgFileObj.files.length > 1) {

                // if there are many files (dicoms) then compress them into a single .zip file before uploading
                url = imgFileObj.baseUrl + imgFileObj.files[0].name + '.zip';
                r.zipFiles(imgFileObj.files,
                  loadFile.bind(null, {url: url, thBarId: thBarId, imgFObjId: imgFObjId}));

              } else {

                url = imgFileObj.baseUrl + imgFileObj.files[0].name;
                r.readFile(imgFileObj.files[0], 'readAsArrayBuffer',
                  loadFile.bind(null, {url: url, thBarId: thBarId, imgFObjId: imgFObjId}));
              }
            }
          });

        } else {

          // this is a new collaborator (not the collaboration owner)
          // insert initial wait text div to manage user expectatives
          self.container.append('<div class="view-initialwaittext">' + 'Please wait while loading the viewer...</div>');

          $('.view-initialwaittext', self.container).css({'color': 'white'});
        }

        self.startCollaborationChat();

      } else {

        // a remote collaborator has connected so just update the collaborators list
        self.chat.updateCollaboratorList();
      }
    };

    /**
     * Handle the onDataFilesShared event when the collaboration owner has shared all data files with this collaborator.
     *
     * @param {Object} collaborator info object with a mail property (collaborator's mail).
     * @param {Object} array of file objects with properties: url, cloudId and thBarId (thumbnails bar's id).
     */
    viewerjs.Viewer.prototype.handleOnDataFilesShared = function(collaboratorInfo, fObjArr) {
      var self = this;

      if (self.collab.collaboratorInfo.id === collaboratorInfo.id) {

        // GDrive files have been shared with this collaborator

        var fileArr = []; // two dimensional array of data arrays

        for (var i = 0; i < fObjArr.length; i++) {

          if (!fileArr[fObjArr[i].thBarId]) {

            fileArr[fObjArr[i].thBarId] = [];
          }

          fileArr[fObjArr[i].thBarId].push({
            url: fObjArr[i].url,
            cloudId: fObjArr[i].id,
            imgFObjId: fObjArr[i].imgFObjId
          });
        }

        // wipe the initial wait text in the collaborators's viewer container
        $('.view-initialwaittext', self.container).remove();

        // restart the viewer
        self.init();

        // update the toolbar's UI
        self.toggleToolbarButtonActivation('collab');
        self.toolBar.disableButton('load');
        self.toolBar.disableButton('book');

        var numOfLoadedThumbnailsBar = 0;

        var checkIfViewerReady = function() {

          if (++numOfLoadedThumbnailsBar === fileArr.length) {

            self.onViewerReady();
          }
        };

        for (i = 0; i < fileArr.length; i++) {

          // add thumbnails bars
          if (fileArr[i]) {

            var imgFileArr = self.buildImgFileArr(fileArr[i]);
            self.addThumbnailsBar(imgFileArr, checkIfViewerReady);
          }
        }

        self.renderScene();
      }
    };

    /**
     * Handle the onCollabObjChanged event when the scene object has been modified by a remote collaborator.
     */
    viewerjs.Viewer.prototype.handleOnCollabObjChanged = function() {

      this.renderScene();
    };

    /**
     * Handle the onNewChatMessage event when a new chat msg is received from a remote collaborator.
     *
     * @param {Obj} chat message object.
     */
    viewerjs.Viewer.prototype.handleOnNewChatMessage = function(msgObj) {

      if (this.chat) {
        this.chat.updateTextArea(msgObj);
      }
    };

    /**
     * Handle the onDisconnect event everytime a remote collaborator disconnects from the collaboration.
     *
     * @param {Obj} collaborator info object.
     */
    viewerjs.Viewer.prototype.handleOnDisconnect = function(collaboratorInfo) {

      if (this.chat) {

        // create a chat message object
        var msgObj = {user: collaboratorInfo.name, msg: 'I have disconnected.'};

        this.chat.updateTextArea(msgObj);
        this.chat.updateCollaboratorList();
      }
    };

    /**
     * This method is called when all the thumbnails bars have been loaded in a collaborator's viewer instance.
     */
    viewerjs.Viewer.prototype.onViewerReady = function() {

      console.log('onViewerReady not overwritten!');
    };

    /**
     * Destroy all internal objects and remove html interface
     */
    viewerjs.Viewer.prototype.cleanUI = function() {

      if (this.rBox) { this.rBox.destroy(); }
      this.rBox = null;

      if (this.toolBar) { this.toolBar.destroy(); }

      this.toolBar = null;

      for (var i = this.thBars.length - 1; i >= 0; i--) {

        this.thBars[i].destroy();
        this.thBars.splice(i, 1);
      }

      this.componentsX = [];

      this.imgFileArr = [];

      if (this.collabWin) { this.collabWin.dialog('destroy'); }
      this.collabWin = null;

      // remove html
      this.container.empty();
    };

    /**
     * Destroy the viewer and leave collaboration if it is active
     */
    viewerjs.Viewer.prototype.destroy = function() {

      if (this.collab && this.collab.collabIsOn) {

        this.leaveCollaboration();
      }

      this.cleanUI();
      this.container = null;
    };

    return viewerjs;
  });
