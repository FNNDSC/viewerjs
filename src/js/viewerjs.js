/**
 * This module takes care of laying out all user interface components as well as implementing the
 * realtime collaboration through the collaborator object injected into viewerjs.Viewer constructor.
 */

// define a new module
define(['utiljs', 'rendererjs', 'rboxjs', 'toolbarjs', 'thbarjs', 'chatjs'], function(util, render, rbox, toolbar, thbar, chat) {

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

      // tool bar object
      this.toolBar = null;

      // prefix string for the DOM ids used for the toolbar's buttons
      this.toolBarBtnsIdPrefix = containerId + '_tbarbtn';

      // renderers box object
      this.rBox = null;

      // prefix string for the DOM ids used for the internal XTK renderers' containers
      this.renderersIdPrefix = containerId + '_renderer';

      // thumbnails bars
      this.thBars = []; // can contain null elements

      // prefix string for the DOM ids used for the thumbnails' containers.
      this.thumbnailsIdPrefix = containerId + '_thumbnail';

      // array of objects containing the renderers box and thumbnails bars in their horizontal
      // visual order (the toolbar is always at the same horizontal position as the renderers box)
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

          $('#' + self.container.attr('id') + ' .view-trash').show();
        },

        beforeStop: function(evt, ui) {

          var parent = ui.placeholder.parent();
          var trash = $('.view-trash', self.container);

          if (trash.hasClass('highlight')) {

            trash.removeClass('highlight');
            // thumbnails bar was deposited on the trash so remove it and its related data

            for (var j=0; j<self.thBars.length; j++) {

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
          }
          else  if (parent[0] === self.container[0]) {

            // layout UI components (renderers box, thumbnails bars and toolbar)
            for (var i=0; i<self.componentsX.length; i++) {

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

          }
          else{
            // cancel ddRop
            $(evt.target).sortable("cancel");
          }

          $('#' + self.container.attr('id') + ' .view-trash').hide();
        }
      });

      self.addRenderersBox();
      self.addToolBar();

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

            for (var j=0; j<self.thBars.length; j++) {

              if (self.thBars[j] && self.thBars[j].container[0] === thBarCont[0]) {

                self.thBars[j] = null;
                break;
              }
            }

            for (j=0; j<self.componentsX.length; j++) {

              if (self.componentsX[j].container[0] === thBarCont[0]) {

                self.componentsX.splice(j,1);
                break;
              }
            }

            thBar.destroy();
            thBarCont.remove();

            // recompute renderers box width
            var rBoxCSSWidth = self.computeRBoxCSSWidth();

            self.rBox.container.css({ width: rBoxCSSWidth });

            // toolbar has the same width as renderers box
            self.toolBar.container.css({ width: rBoxCSSWidth });

            self.layoutComponentsX();
          }

          // remove corresponding renderer in the renderers box if there is any
          var rArr = self.rBox.renderers.filter( function(el) {

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
         file = {name: path.substring(path.lastIndexOf('/')+1),
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
         for (var i=0; i<imgFileArr.length; i++) {
           var j = 0;

           do {

             path = imgFileArr[i].baseUrl + imgFileArr[i].files[j].name;
             name = path.substring(0, path.lastIndexOf('.'));

           } while ((++j<imgFileArr[i].files.length)  && (key!==name));

           if (key === name) {
             imgFileArr[i][filetype] = files[key];
             break;
           }
         }
       }
     }

     // add files to proper internal data structures
     for (var i=0; i<fObjArr.length; i++) {
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
     for (i=0; i<nonDcmData.length; i++) {
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

     for (i=0; i<imgFileArr.length; i++) {
       imgFileArr[i].id = i + len;
     }

     return imgFileArr;
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
     self.container.sortable( 'option', 'cancel', '.view-renderers');

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
         display:'block',
         width: thWidth,
         height: thHeight });
     };

     this.rBox.onStart = function() {

       // thumbnails bars' scroll bars have to be removed to make the moving helper visible
       self.thBars.forEach( function(thBar) {

         if (thBar) { thBar.container.css({ overflow: 'visible' }); }
       });
     };

     this.rBox.onBeforeStop = function(evt, ui) {

       var id = self.rBox.getRendererId(ui.item.find('.view-renderer-content').attr('id'));

       if (ui.placeholder.parent().parent()[0] === self.getThumbnailsBarObject(id).container[0]) {

         $(evt.target).sortable('cancel');

         var rArr = self.rBox.renderers.filter( function(el) {
           return el.id === id;
         });

         self.rBox.removeRenderer(rArr[0]);

       } else if (ui.placeholder.parent()[0] !== evt.target) {

         $(evt.target).sortable('cancel');
       }

       // restore thumbnails bars' scroll bars
       self.thBars.forEach( function(thBar) {

         if (thBar) { thBar.container.css({ overflow: 'auto' }); }
       });
     };

     this.rBox.onRendererChange = function() {

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

      $('#' + thBar.getThumbnailContId(imgFileObj.id)).css({ display:"none" });

      self.rBox.addRenderer(imgFileObj, 'Z', function(renderer) {

        if (renderer) {

          if (self.rBox.numOfRenderers===2) {

            // if there are now 2 renderers in the renderers box then show the Link views button
            $('#' + self.toolBarBtnsIdPrefix + 'link').css({display: '' });
          }

        } else {

          // could not add renderer so restore the corresponding thumbnail
          $('#' + thBar.getThumbnailContId(imgFileObj.id)).css({ display:"" });
        }

        if (callback) {callback(renderer);}
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
         $('#' + thContId).css({ display:'block' });
       }

       // if there is now a single renderer then hide the Link views button
       if (this.rBox.numOfRenderers===1) {

         $('#' + this.toolBarBtnsIdPrefix + 'link').css({display: 'none' });

         if (this.rBox.renderersLinked) {
           this.handleToolBarButtonLinkClick();
         }
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
      self.container.sortable( 'option', 'cancel', '.view-toolbar');

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
      var btnsIdsPrefix = self.toolBarBtnsIdPrefix;

      self.toolBar.addButton({
        id: btnsIdsPrefix + 'load',
        title: 'Load data',
        caption: '<i class="fa fa-folder-open"></i>  <input type="file"  webkitdirectory="" mozdirectory="" directory="" multiple style="display:none">',

        onclick: function() {

          var loadButton = $('input', this);

          var loadFiles = function(e) {

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

            self.addData(imgFileArr);
          };

          loadButton.off('change').on('change', loadFiles);

          loadButton[0].click(function( event ) {

            event.stopPropagation();
          });
        }
      });

      self.toolBar.addButton({
        id: btnsIdsPrefix + 'link',
        title: 'Link views',
        caption: '<i class="fa fa-link"></i>',

        onclick: function() {

          self.handleToolBarButtonLinkClick();
          self.updateCollabScene();
        }
      });

      // hide the button
      self.toolBar.hideButton(btnsIdsPrefix + 'link');

      self.toolBar.addButton({
        id: btnsIdsPrefix + 'collab',
        title: 'Start collaboration',
        caption: '<i class="fa fa-users"></i>',

        onclick: function() {

          if (self.collab.collabIsOn) {

            self.leaveCollaboration();

          } else {

            self.startCollaboration();
          }
        }
      });

      self.toolBar.addButton({
        id: btnsIdsPrefix + 'help',
        title: 'Wiki help',
        caption: '<i class="fa fa-question"></i>',
        onclick: function() {
          window.open('https://github.com/FNNDSC/viewerjs/wiki');
        }
      });

      // tool bar event listeners
      this.handleToolBarButtonLinkClick = function() {

        var jqButton = $('#' +  btnsIdsPrefix + 'link');

        if (self.rBox.renderersLinked) {

          self.rBox.renderersLinked = false;
          jqButton.removeClass('active');
          jqButton.attr('title', 'Link views');

        } else {

          self.rBox.renderersLinked = true;
          jqButton.addClass('active');
          jqButton.attr('title', 'Unlink views');
        }
      };

      // make space for the toolbar
      var renderersTopEdge = parseInt(self.toolBar.container.css('top')) + parseInt(self.toolBar.container.css('height')) + 5;
      self.rBox.container.css({ top: renderersTopEdge + 'px' });
      self.rBox.container.css({ height: 'calc(100% - ' + renderersTopEdge + 'px)' });
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
          top: self.rBox.container.css('top'),
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
        for (var i=0; i<self.rBox.renderers.length; i++) {

          // corresponding thumbnail and renderer have the same integer id
          var id = self.rBox.renderers[i].id;
          var thContId = thBar.getThumbnailContId(id);

          $('#' + thContId).css({ display:"none" });
        }

        if (callback) { callback(); }
      });


      // get the jQuery sortable for the trash element
      var trash = $('.view-trash', self.container);

      $('.view-trash-sortable', trash).sortable( {

        over: function() {

          trash.addClass('highlight');
        },

        out: function() {

          trash.removeClass('highlight');
        }
      });

      // link the thumbnails bar with the renderers box
      self.rBox.setComplementarySortableElems('#' + self.container.attr('id') + ' .view-thumbnailsbar-sortable');
      thBar.setComplementarySortableElems('#' + self.container.attr('id') + ' .view-renderers');

      // link the thumbnails bar with the trash's sortable element
      thBar.jqSortable.sortable( "option", "connectWith", '#' + self.container.attr('id') + ' .view-renderers, #' +
        self.container.attr('id') + ' .view-trash-sortable');

      //
      // thumbnails bar event listeners
      //
      thBar.onBeforeStop = function(evt, ui) {

        var id = thBar.getThumbnailId(ui.item.attr("id"));
        var parent = ui.placeholder.parent();

        if(trash.hasClass('highlight')){
          trash.removeClass('highlight');

          $(evt.target).sortable("cancel");
          self.removeData(id);
        }
        else if (parent[0] === self.rBox.container[0]) {
          $(evt.target).sortable("cancel");

          // add the corresponding renderer (with the same integer id) to the UI
          self.addRenderer(self.getImgFileObject(id), function(renderer) {

            if (renderer) {

              self.updateCollabScene();
            }
          });

        }
        else{
          // cancel ddRop
          $(evt.target).sortable("cancel");
        }

        trash.hide();
        
      };

      thBar.onStart = function() {

        trash.show();
      };

      // append a thumbnails bar id to each array elem
      for (var i=0; i<imgFileArr.length; i++) {
        imgFileArr[i].thBarId = self.thBars.length;
      }

      // add the new data array to the viewer's main array
      self.imgFileArr = self.imgFileArr.concat(imgFileArr);

      // push thumbnails bar in the array of thumbnails bar object
      self.thBars.push(thBar);

      // insert thumbnails bar in front of the array of horizontal components
      self.componentsX.unshift(thBar);

      var rBoxCSSWidth = self.computeRBoxCSSWidth();

      self.rBox.container.css({ width: rBoxCSSWidth });

      // toolbar has the same width as renderers box
      self.toolBar.container.css({ width: rBoxCSSWidth });

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

      for (var i=0; i<this.thBars.length; i++) {

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
      for (var i=0; i<self.componentsX.length; i++) {

        if (self.componentsX[i].renderers) {
          rBIx = i;
          break;
        }
      }

      // position elements to the left of the renderers box including it
      var comps = self.componentsX.slice(0, rBIx + 1);

      comps.forEach( function(el, ix) {

        if (self.toolBar && (ix === rBIx)) {

          // toolbar is always on the same column as renderers box
          self.toolBar.container.css({ left: left + 'px', right: 'auto' });
        }

        el.container.css({ left: left + 'px', right: 'auto' });
        left += parseInt(el.container.css('width')) + 5 ;
      });

      // position  elements to the right of the renderers box
      comps = self.componentsX.slice(rBIx + 1);

      comps.reverse().forEach( function(el) {

        el.container.css({ left: 'auto', right: right + 'px' });
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

      if (id<0 || id>=this.imgFileArr.length) {

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
        for (var i=0; i<scene.renderers.length; i++) {

          if (scene.renderers[i].general.type = '2D') {

            renderers2DIds.push(scene.renderers[i].general.id);
            renderers2DProps.push(scene.renderers[i]);
          }
        }

        // remove the 2D renderers from the local scene that were removed from the collab scene
        for (i=0; i<self.rBox.renderers.length; i++) {

          id = self.rBox.renderers[i].id;

          if (renderers2DIds.indexOf(id) === -1) {

            var thContId = self.getThumbnailsBarObject(id).getThumbnailContId(id);

            $('#' + thContId).css({ display: "block" });

            self.rBox.removeRenderer(self.rBox.renderers[i]);
          }
        }

        for (i=0; i<renderers2DIds.length; i++) {

          // add a 2D renderer to the local scene that was added to the collab scene
          id = renderers2DIds[i];

          $('#' + self.getThumbnailsBarObject(id).getThumbnailContId(id)).css({ display: "none" });

          self.addRenderer(self.getImgFileObject(id), updateRenderer);
        }
      }


      if (self.collab && self.collab.collabIsOn) {

        // collaboration is on, so get and render the scene
        scene = self.getCollabScene();

        if (self.rBox.renderersLinked !== scene.toolBar.renderersLinked) {

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
      scene.toolBar.renderersLinked = this.rBox.renderersLinked;

      // set renderers' properties
      // https://docs.google.com/document/d/1GHT7DtSq1ds4TyplA0E2Efy4fuv2xf17APcorqzBZjc/edit
      scene.renderers = [];

      // parse each renderer and get information to be synchronized
      for (var j=0; j<renderers.length; j++) {
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
     * Start the realtime collaboration as a collaboration/scene owner.
     */
    viewerjs.Viewer.prototype.startCollaboration = function() {
      var self = this;

      if (self.collab) {
        self.collab.authorizeAndLoadApi(true, function(granted) {

          if (granted) {
            // realtime API ready.
            self.collab.startRealtimeCollaboration(self.getLocalScene());

          } else {

            var grant = function() {
              self.collab.authorizeAndLoadApi(false, function(granted) {

                if (granted) {
                  // hide modal
                  $('#collabModal').hide();
                  // realtime API ready.
                  self.collab.startRealtimeCollaboration(self.getLocalScene());
                }
              });
            };

            var deny = function(){
              $('#collabModal').hide();
            };

            // create a modal....
            $('#collabModal').show();
            $('#collabGrant').off('click').on('click', grant);
            $('#collabDeny').off('click').on('click', deny);
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

        // update the UI
        var collabButton = document.getElementById(this.toolBarBtnsIdPrefix + 'collab');
        collabButton.removeClass('active');
        collabButton.title = 'Start collaboration';

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

        for (var i=0; i<self.imgFileArr.length; i++) {
          ++nFiles;

          if (self.imgFileArr[i].json) {
            ++nFiles;
          }
        }

        return nFiles;
      }());

      // function to load a file into GDrive
      var fObjArr = [];
      function loadFile(fInfo, fData) {

        function writeToGdrive(info, data) {

          var name = info.url.substring(info.url.lastIndexOf('/') + 1);

          self.collab.fileManager.writeFile(self.collab.dataFilesBaseDir + '/' + name, data, function(fileResp) {

            fObjArr.push({id: fileResp.id, url: info.url, thBarId: info.thBarId});

            if (fObjArr.length===totalNumFiles) {

              // all data files have been uploaded to GDrive
              self.collab.setDataFileList(fObjArr);
            }
          });
        }

        if (fInfo.url.search(/.dcm.zip$|.ima.zip$|.zip$/i) !== -1) {

          // fData is an array of arrayBuffer so instead of one file now fData.length files need to be uploaded
          totalNumFiles += fData.length-1;
          writeToGdrive(fInfo, fData[0]);

          for (var j=1; j<fData.length; j++) {

            fInfo.url = fInfo.url.replace(/.dcm.zip$|.ima.zip$|.zip$/i, j+'$&');
            writeToGdrive(fInfo, fData[j]);
          }

        } else {

          // fData is just a single arrayBuffer
          writeToGdrive(fInfo, fData);
        }
      }

      if (self.collab.collaboratorInfo.id === collaboratorInfo.id) {

        // local on connect

        if (self.collab.collabOwner) {
          var collabButton = $(self.toolBarBtnsIdPrefix + 'collab');
          collabButton.addClass('active');
          collabButton.title = 'End collaboration';

          // asyncronously load all files to GDrive
          self.collab.fileManager.createPath(self.collab.dataFilesBaseDir, function() {

            // create a rendererjs.Renderer object to use its methods
            var r = new render.Renderer({ container: null, rendererId: "" }, self.collab);

            for (var i=0; i<self.imgFileArr.length; i++) {

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

          // insert initial wait text div to manage user expectatives
          self.container.append( '<div class="view-initialwaittext">' + 'Please wait while loading the viewer...</div>' );

          $('.view-initialwaittext', self.container).css( {'color': 'white'} );
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

         for (var i=0; i<fObjArr.length; i++) {

           if (!fileArr[fObjArr[i].thBarId]) {

             fileArr[fObjArr[i].thBarId] = [];
           }

           fileArr[fObjArr[i].thBarId].push({url: fObjArr[i].url, cloudId: fObjArr[i].id});
         }

         // wipe the initial wait text in the collaborators's viewer container
         $('.view-initialwaittext', self.container).remove();

         // start the viewer
         self.init();

         // update the toolbar's UI
         var collabButton = $(this.toolBarBtnsIdPrefix + 'collab');
         collabButton.addClass('active');
         collabButton.title = 'End collaboration';

         var numOfLoadedThumbnailsBar = 0;

         var checkIfViewerReady = function() {

           if (++numOfLoadedThumbnailsBar === fileArr.length) {

             self.onViewerReady();
           }
         };

         for (i=0; i<fileArr.length; i++) {

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
     * Destroy all objects and remove html interface
     */
    viewerjs.Viewer.prototype.destroy = function() {

      if (this.collab && this.collab.collabIsOn) {
        this.leaveCollaboration();
      }

      // destroy objects
      this.rBox.destroy();
      this.rBox = null;

      this.toolBar.destroy();
      this.toolBar = null;

      for (var i=this.thBars.length-1; i>=0; i--) {

        this.thBars[i].destroy();
        this.thBars.splice(i, 1);
      }

      this.imgFileArr = [];

      // remove html
      this.container.empty();
    };


  return viewerjs;
});
