/**
 * This module takes care of laying out all user interface components as well as implementing the
 * realtime collaboration through the collaborator object injected into viewerjs.Viewer constructor.
 */

// define a new module
define(['text!collabwin', 'utiljs', 'rendererjs', 'rboxjs', 'toolbarjs',

  'thbarjs', 'chatjs'], function(collabwin, util, render, rbox, toolbar, thbar, chat) {

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

      // jQuery object for the collaboration dialog window
      this.libraryWin = null;

      // tool bar object
      this.toolBar = null;

      // renderers box object
      this.rBox = null;

      // prefix string for the DOM ids used for the internal XTK renderers' containers
      this.renderersIdPrefix = containerId + '_renderer';

      // thumbnails bars
      this.thBars = []; // can contain null elements

      // prefix string for the DOM ids used for the thumbnails' containers.
      this.thumbnailsIdPrefix = containerId + '_thumbnail';

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
      //  -json: Optional HTML5 File or custom file object (optional json file with the mri info for imgType different from 'dicom')
      this.imgFileArr = []; // can contain null elements

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
        connectWith: '#' + self.container.attr('id') + ' .view-trash-sortable', // thumbnails bars can be trashed
        dropOnEmpty: true,

        start: function() {

          self.trash.show();
        },

        beforeStop: function(evt, ui) {

          var parent = ui.placeholder.parent();

          if (self.trash.hasClass('highlight')) {

            self.trash.removeClass('highlight');
            // thumbnails bar was deposited on the trash so remove it and its related data

            for (var j = 0; j < self.thBars.length; j++) {

              // find the trashed thumbnails bar's object
              if (self.thBars[j] && self.thBars[j].container[0] === ui.item[0]) {

                var thBar = self.thBars[j];
                break;
              }
            }

            var thumbnails = $('.view-thumbnail', ui.item);

            thumbnails.each(function() {

              var id = thBar.getThumbnailId(this.id);
              self.removeData(id);
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

      self.initLibraryWindow();

      // set a dropzone
      util.setDropzone(self.containerId, function(fObjArr) {

        self.addData(fObjArr);
      });
    };

    /**
     * Add new data to the viewer. A new thumbnails bar is added to the UI for the new data.
     *
     * @param {Array} array of file objects. Each object contains the following properties:
     * -url:     String representing the file url
     * -file:    HTML5 File object (optional but neccesary when the files are gotten through a
     *           local filepicker or dropzone)
     * -cloudId: String representing the file cloud id (optional but neccesary when the files
     *           are gotten from a cloud storage like GDrive)
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

            if (self.thBars[j] && self.thBars[j].container[0] === thBarCont[0]) {

              self.thBars[j] = null;
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

        self.imgFileArr[id] = null;
      }
    }
  };

    /**
     * Build an array of image file objects (viewer's main data structure).
     *
     * @param {Array} array of file objects. Same as the one passed to the init method.
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

        if (fileObj.cloudId) {
          file.cloudId = fileObj.cloudId;
        }
      }

      imgType = render.Renderer.imgType(file);

      if (imgType === 'dicom') {

        if (!dicoms[baseUrl]) {
          dicoms[baseUrl] = [];
        }
        dicoms[baseUrl].push(file); // all dicoms with the same base url belong to the same volume

      } else if (imgType === 'dicomzip') {

        if (!dicomZips[baseUrl]) {
          dicomZips[baseUrl] = [];
        }
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

    // sort the built array for consistency among possible collaborators
    imgFileArr.sort(function(el1, el2) {
       var val1 = el1.baseUrl + el1.files[0].name.replace(/.zip$/, '');
       var val2 = el2.baseUrl + el2.files[0].name.replace(/.zip$/, '');
       var values = [val1, val2].sort();

       if (values[0] === values[1]) {
         return 0;
       } else if (values[0] === val1) {
         return -1;
       } else {
         return 1;
       }
     });

    // assign an integer id to each array elem
    var len = self.imgFileArr.length;

    for (i = 0; i < imgFileArr.length; i++) {
      imgFileArr[i].id = i + len;
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
      },
      renderersIdPrefix: self.renderersIdPrefix
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
      var id = self.rBox.getRendererId(target.find('.view-renderer-content').attr('id'));
      var thContId = self.getThumbnailsBarObject(id).getThumbnailContId(id);

      // the visually moving helper is a clone of the corresponding thumbnail
      return $('#' + thContId).clone().css({
        display: 'block',
        width: thWidth,
        height: thHeight});
    };

    this.rBox.onStart = function() {

      // thumbnails bars' scroll bars have to be removed to make the moving helper visible
      self.thBars.forEach(function(thBar) {

        if (thBar) { thBar.container.css({overflow: 'visible'}); }
      });
    };

    this.rBox.onBeforeStop = function(evt, ui) {

      var id = self.rBox.getRendererId(ui.item.find('.view-renderer-content').attr('id'));

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

        if (thBar) { thBar.container.css({overflow: 'auto'}); }
      });
    };

    this.rBox.onRendererChange = function(evt) {

      if ((evt.type === 'click') && $(evt.currentTarget).hasClass('view-renderer-titlebar-buttonpane-pin')) {

        var selectedArr = this.getSelectedRenderers();

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

    $('#' + thBar.getThumbnailContId(imgFileObj.id)).css({display: 'none'});

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
        $('#' + thBar.getThumbnailContId(imgFileObj.id)).css({display: ''});
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
        var thContId = thBar.getThumbnailContId(id);

        // display the removed renderer's thumbnail
        $('#' + thContId).css({display: 'block'});
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

        var loadButton = $('input', self.toolBar.getButton('load').button);

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

        loadButton.off('change').on('change', loadFiles);

        loadButton[0].click(function(event) {

          event.stopPropagation();
        });
      }
    });

    //
    // Load file
    self.toolBar.addButton({
      id: 'book',
      title: 'Load from library',
      caption: '<i class="fa fa-book"></i>',
      onclick: function() {

        self.libraryWin.dialog('open');

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
     * Initilize library window's HTML and event handlers.
     */
    viewerjs.Viewer.prototype.initLibraryWindow = function() {
    var self = this;

    self.libraryWin = $('<div></div>');

    // convert the previous div into a floating window with a close button
    self.libraryWin.dialog({
      title: 'Load additional data',
      modal: true,
      autoOpen: false,
      minHeight: 400,
      height: 600,
      minWidth: 700,
      width: 800
    });

    var library = [
    {
      sectionLabel: 'Day 0 to 14',
      notes: 'Oh yes I\'m a cool notes',
      datasets: [
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii'
      ]
    },
    {
      sectionLabel: 'Quarter 0',
      notes: 'Me too!',
      datasets: [
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii'
      ]
    },
    {
      sectionLabel: 'Quarter 1',
      notes: 'Oh yes I\'m a cool notes too',
      datasets: [
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii',
        'http://www.googledrive.com/host/0B8u7h0aKnydhd0xHX2h0NENsbEE/w0to1.nii'
      ]
    }];

    var libraryContainerDiv = document.createElement('div');
    $(libraryContainerDiv)
        .addClass('library');
    self.libraryWin.append($(libraryContainerDiv));

    for(var i = 0; i<library.length; i++){
      // section
      var sectionDiv = document.createElement('div');
      $(sectionDiv)
        .addClass('section')
        .attr('sectionIndex', i);
      $(libraryContainerDiv).append($(sectionDiv));

      // title
      var titleDiv = document.createElement('div');
      $(titleDiv)
        .addClass('title')
        .html(library[i].sectionLabel);
      $(sectionDiv).append($(titleDiv));

      // note
      var notesDiv = document.createElement('div');
      $(notesDiv)
        .addClass('notes')
        .html(library[i].notes);
      $(sectionDiv).append($(notesDiv));

      // thumbnails
      var thumbnailsContainerDiv = document.createElement('div');
      $(thumbnailsContainerDiv)
        .addClass('thumbnailsContainer');
      $(sectionDiv).append($(thumbnailsContainerDiv));

      for(var j=0; j<library[i].datasets.length; j++){
        var thumbnailDiv = document.createElement('div');
        $(thumbnailDiv)
          .addClass('thumbnail')
          .css('background-image', 'url(' + library[i].datasets[j] + '.jpg)');
        $(thumbnailsContainerDiv).append(thumbnailDiv);
      }
    }

    // fill content (no need for append)

    // connect search bar...
    // $('.view-librarywin-input').keyup(function() {
    //   var valThis = $(this).val();
    //   window.console.log('connecter: ' + valThis);
    //   $('.navList>li').each(function() {
    //     var text = $(this).text().toLowerCase();
    //     return (text.indexOf(valThis) === 0) ? $(this).show() : $(this).hide();
    //   });
    // });

    // connect each element of the lists to nii, json and jpg
    $('.library > .section').on('click', function() {

      var sectionIndex = $(this).attr('sectionIndex');
      window.console.log(sectionIndex);

      // build list
      var imgFileArr = [];

      for(var i=0; i< library[sectionIndex].datasets.length; i++){
        imgFileArr.push({
          'url': library[sectionIndex].datasets[i] + '.gz'
        });

        imgFileArr.push({
          'url': library[sectionIndex].datasets[i] + '.jpg'
        });

        imgFileArr.push({
          'url': library[sectionIndex].datasets[i] + '.json'
        });
      }

      // load atlases
      self.addData(imgFileArr);

      // close window
      self.libraryWin.dialog('close');
    });
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
      layout: 'vertical',
      thumbnailsIdPrefix: self.thumbnailsIdPrefix
    };

    // check if there is a cloud file manager available
    var fileManager = null;
    if (self.collab) { fileManager = self.collab.fileManager; }

    // create the thumbnails bar object
    var thBar = new thbar.ThumbnailsBar(options, fileManager);

    thBar.init(imgFileArr, function() {

      // hide any thumbnail with a corresponding renderer (same integer id suffix) already added to the renderers box
      for (var i = 0; i < self.rBox.renderers.length; i++) {

        // corresponding thumbnail and renderer have the same integer id
        var id = self.rBox.renderers[i].id;
        var thContId = thBar.getThumbnailContId(id);

        $('#' + thContId).css({display: 'none'});
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
    var viewerSelector = '#' + self.container.attr('id');
    self.rBox.setComplementarySortableElems(viewerSelector + ' .view-thumbnailsbar-sortable');
    thBar.setComplementarySortableElems(viewerSelector + ' .view-renderers');

    // link the thumbnails bar with the trash's sortable element
    thBar.jqSortable.sortable('option', 'connectWith', viewerSelector + ' .view-renderers, ' +
      viewerSelector + ' .view-trash-sortable');

    //
    // thumbnails bar event listeners
    //
    thBar.onBeforeStop = function(evt, ui) {

      var id = thBar.getThumbnailId(ui.item.attr('id'));
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

      self.trash.show();
    };

    // append a thumbnails bar id to each array elem
    for (var i = 0; i < imgFileArr.length; i++) {

      imgFileArr[i].thBarId = self.thBars.length;
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

      var nTh = 0; // number of thumbnails bars in the viewer
      var ix, rBoxCSSWidth;

      for (var i = 0; i < this.thBars.length; i++) {

        if (this.thBars[i]) {

          nTh++;
          ix = i; // save the index of a non-null thumbnails bar object
        }
      }

      if (nTh) {

        var thBarSpace = parseInt(this.thBars[ix].container.css('width')) + 10;
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
     * @param {Number} Integer number between 0 and this.imgFileArr.length-1.
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

      if (id < 0 || id >= this.imgFileArr.length) {

        return null;
      }

      return this.imgFileArr[id];
    };

    /**
     * Given an image file object id get the thumbnails bar object that contains the associated thumbnail image.
     *
     * @param {Number} Integer number between 0 and this.imgFileArr.length-1.
     * @return {Object} thumbnails bar object or null.
     */
    viewerjs.Viewer.prototype.getThumbnailsBarObject = function(id) {

      var imgFileObj = this.getImgFileObject(id);

      if (!imgFileObj) { return null; }

      return this.thBars[imgFileObj.thBarId];
    };

    /**
     * Render the current scene.
     */
    viewerjs.Viewer.prototype.renderScene = function() {
    var self = this;

    var scene;

    // define function to render the renderers in the renderers box
    function renderRenderers() {

      var id;
      var renderers2DIds = [];
      var renderers2DProps = [];

      var updateRenderer = function(renderer) {

        var ix = renderers2DIds.indexOf(renderer.id);

        // update the volume properties
        renderer.volume.lowerThreshold = renderers2DProps[ix].volume.lowerThreshold;
        renderer.volume.upperThreshold = renderers2DProps[ix].volume.upperThreshold;
        renderer.volume.windowLow = renderers2DProps[ix].volume.lowerWindowLevel;
        renderer.volume.windowHigh = renderers2DProps[ix].volume.upperWindowLevel;
        renderer.volume.indexX = renderers2DProps[ix].volume.indexX;
        renderer.volume.indexY = renderers2DProps[ix].volume.indexY;
        renderer.volume.indexZ = renderers2DProps[ix].volume.indexZ;

        // update the camera
        var obj = JSON.parse(renderers2DProps[ix].renderer.viewMatrix);
        var arr = $.map(obj, function(el) { return el; });
        renderer.renderer.camera.view = new Float32Array(arr);

        // update the flip orientation
        renderer.renderer.flipColumns = renderers2DProps[ix].renderer.flipColumns;
        renderer.renderer.flipRows = renderers2DProps[ix].renderer.flipRows;

        // update the pointing position
        renderer.renderer.pointer = renderers2DProps[ix].renderer.pointer;

        // update the slice info HTML
        renderer.updateUISliceInfo();
      };

      // get the collab scene's 2D renderer ids
      for (var i = 0; i < scene.renderers.length; i++) {

        if (scene.renderers[i].general.type = '2D') {

          renderers2DIds.push(scene.renderers[i].general.id);
          renderers2DProps.push(scene.renderers[i]);
        }
      }

      // remove the 2D renderers from the local scene that were removed from the collab scene
      for (i = 0; i < self.rBox.renderers.length; i++) {

        id = self.rBox.renderers[i].id;

        if (renderers2DIds.indexOf(id) === -1) {

          var thContId = self.getThumbnailsBarObject(id).getThumbnailContId(id);

          $('#' + thContId).css({display: 'block'});

          self.rBox.removeRenderer(self.rBox.renderers[i]);
        }
      }

      for (i = 0; i < renderers2DIds.length; i++) {

        // add a 2D renderer to the local scene that was added to the collab scene
        id = renderers2DIds[i];

        $('#' + self.getThumbnailsBarObject(id).getThumbnailContId(id)).css({display: 'none'});

        self.addRenderer(self.getImgFileObject(id), updateRenderer);
      }
    }

    if (self.collab && self.collab.collabIsOn) {

      // collaboration is on, so get and render the scene
      scene = self.getCollabScene();

      if (self.renderersLinked !== scene.toolBar.renderersLinked) {

        self.handleToolBarButtonLinkClick();
      }

      renderRenderers();
    }
  };

    /**
     * Create and return a scene object describing the current scene.
     */
    viewerjs.Viewer.prototype.getLocalScene = function() {

      var scene = {};
      var renderers = this.rBox.renderers;

      // set toolbar's properties
      scene.toolBar = {};
      scene.toolBar.renderersLinked = this.renderersLinked;

      // set renderers' properties
      // https://docs.google.com/document/d/1GHT7DtSq1ds4TyplA0E2Efy4fuv2xf17APcorqzBZjc/edit
      scene.renderers = [];

      // parse each renderer and get information to be synchronized
      for (var j = 0; j < renderers.length; j++) {
        var rInfo = {};

        // set general information about the renderer
        rInfo.general = {};

        rInfo.general.id = renderers[j].id;
        rInfo.general.type = '2D';

        // set renderer specific information
        rInfo.renderer = {};
        rInfo.renderer.viewMatrix = JSON.stringify(renderers[j].renderer.camera.view);
        rInfo.renderer.flipColumns = renderers[j].renderer.flipColumns;
        rInfo.renderer.flipRows = renderers[j].renderer.flipRows;
        rInfo.renderer.pointer = renderers[j].renderer.pointer;

        // set volume specific information
        // only supports 1 volume for now....
        rInfo.volume = {};
        rInfo.volume.file = renderers[j].volume.file;
        rInfo.volume.lowerThreshold = renderers[j].volume.lowerThreshold;
        rInfo.volume.upperThreshold = renderers[j].volume.upperThreshold;
        rInfo.volume.lowerWindowLevel = renderers[j].volume.windowLow;
        rInfo.volume.upperWindowLevel = renderers[j].volume.windowHigh;
        rInfo.volume.indexX = renderers[j].volume.indexX;
        rInfo.volume.indexY = renderers[j].volume.indexY;
        rInfo.volume.indexZ = renderers[j].volume.indexZ;

        // set interactor specific information
        rInfo.interactor = {};

        // set camera specific information
        rInfo.camera = {};

        // set pointer specific information
        rInfo.pointer = {};

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

        if (self.imgFileArr[i].json) {
          ++nFiles;
        }
      }

      return nFiles;
    }());

    // callback to load a file into GDrive
    var fObjArr = [];
    var loadFile = function(fInfo, fData) {

      function writeToGdrive(info, data) {

        var name = info.url.substring(info.url.lastIndexOf('/') + 1);

        self.collab.fileManager.writeFile(self.collab.dataFilesBaseDir + '/' + name, data, function(fileResp) {

          fObjArr.push({id: fileResp.id, url: info.url, thBarId: info.thBarId});

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
          var r = new render.Renderer({container: null, rendererId: ''}, self.collab);

          for (var i = 0; i < self.imgFileArr.length; i++) {

            var imgFileObj = self.imgFileArr[i];
            var thBarId = imgFileObj.thBarId;
            var url;

            if (imgFileObj.json) {

              url = imgFileObj.baseUrl + imgFileObj.json.name;
              r.readFile(imgFileObj.json, 'readAsArrayBuffer', loadFile.bind(null, {url: url, thBarId: thBarId}));
            }

            if (imgFileObj.files.length > 1) {

              // if there are many files (dicoms) then compress them into a single .zip file before uploading
              url = imgFileObj.baseUrl + imgFileObj.files[0].name + '.zip';
              r.zipFiles(imgFileObj.files, loadFile.bind(null, {url: url, thBarId: thBarId}));

            } else {

              url = imgFileObj.baseUrl + imgFileObj.files[0].name;
              r.readFile(imgFileObj.files[0], 'readAsArrayBuffer', loadFile.bind(null, {url: url, thBarId: thBarId}));
            }
          }
        });

      } else {

        // this is a new collaborator (not the collaboration owner)

        // wipe current visualization
        self.cleanUI();

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

         fileArr[fObjArr[i].thBarId].push({url: fObjArr[i].url, cloudId: fObjArr[i].id});
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
         var imgFileArr = self.buildImgFileArr(fileArr[i]);
         self.addThumbnailsBar(imgFileArr, checkIfViewerReady);
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

      this.rBox.destroy();
      this.rBox = null;

      this.toolBar.destroy();
      this.toolBar = null;

      for (var i = this.thBars.length - 1; i >= 0; i--) {

        if (this.thBars[i]) { this.thBars[i].destroy(); }
        this.thBars.splice(i, 1);
      }

      this.componentsX = [];

      this.imgFileArr = [];

      if (this.collabWin) { this.collabWin.dialog('destroy'); }
      this.collabWin = null;
      this.libraryWin.dialog('destroy');
      this.libraryWin = null;

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
