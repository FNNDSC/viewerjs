/**
 * This module takes care of laying out all user interface componentes as well as implementing the
 * realtime collaboration through the collaborator object injected into viewerjs.Viewer constructor.
 */

// define a new module
define(['rboxjs', 'toolbarjs', 'thbarjs', 'chatjs'], function(rbox, toolbar, thbar, chat) {

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
    * @param {String} HTML container's id.
    * @param {Object} Optional collaborator object to enable realtime collaboration.
    */
    viewerjs.Viewer = function(containerId, collab) {

      this.version = 0.0;
      // viewer container's id
      this.contId = containerId;
      // jQuery object for the viewer's div element (viewer container)
      this.jqViewer = null;
      // tool bar object
      this.toolBar = null;
      // renderers box object
      this.rBox = null;
      // thumbnail bar object
      this.thBar = null;

      // array of image file objects (main viewer's data structure)
      // each object contains the following properties:
      //  -id: Integer, the object's id
      //  -baseUrl: String ‘directory/containing/the/files’
      //  -imgType: String neuroimage type. Any of the possible values returned by rboxjs.RenderersBox.imgType
      //  -files: Array of HTML5 or custom File objects (it contains a single file for imgType different from 'dicom')
      //   DICOM files with the same base url/path are assumed to belong to the same volume
      //  -thumbnail: HTML5 or custom File object (optional jpg file for a thumbnail image)
      //  -json: HTML5 or custom File object (optional json file with the mri info for imgType different from 'dicom')
      this.imgFileArr = [];

      //
      // collaborator object
      //
      if (collab) {
        this.collab = collab;
        // chat object
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
      }

    };

    /**
     * Build viewer's main data structure and initiliaze the UI's html.
     *
     * @param {Array} array of file objects. Each object contains the following properties:
     * -url:     String representing the file url
     * -file:    HTML5 File object (optional but neccesary when the files are gotten through a
     *           local filepicker or dropzone)
     * -cloudId: String representing the file cloud id (optional but neccesary when the files
     *           are gotten from a cloud storage like GDrive)
     */
    viewerjs.Viewer.prototype.init = function(fObjArr) {

      this.jqViewer = $('#' + this.contId).css({
        'position': 'relative',
        'margin': 0,
        '-webkit-box-sizing': 'border-box',
        '-moz-box-sizing': 'border-box',
        'box-sizing': 'border-box'
      });

      if (this.collab && this.collab.collabIsOn && !this.collab.collabOwner) {
        // Wipe the initial wait text in the collaborators's viewer container
        $('#' + this.contId + '_initwaittext').remove();
      }

      // Initially the interface only contains the renderers box
      this.addRenderersBox();

      // Build viewer's main data structure (this.imgFileArr)
      this._buildImgFileArr(fObjArr);

      // Render the scene
      this.renderScene();
    };

    /**
     * Build viewer's main data structure (the model).
     *
     * @param {Array} array of file objects. Same as the one passed to the init method.
     */
    viewerjs.Viewer.prototype._buildImgFileArr = function(fObjArr) {
      var thumbnails = {}; // associative array of thumbnail image files
      var jsons = {}; // associative array of json files
      var dicoms = {}; // associative array of arrays with ordered DICOM files
      var dicomZips = {}; // associative array of arrays with zipped DICOM files
      var nonDcmData = []; // array of non-DICOM data
      var path, name;
      var self = this;

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

       imgType = rbox.RenderersBox.imgType(file);

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
     // image file object in self.imgFileArr
     function assignUtilityFiles(files, filetype) {
       for (var key in files) {
         // Search for a neuroimage file with the same name as the current utility file
         for (var i=0; i<self.imgFileArr.length; i++) {
           var j = 0;
           do {
             path = self.imgFileArr[i].baseUrl + self.imgFileArr[i].files[j].name;
             name = path.substring(0, path.lastIndexOf('.'));
           } while ((++j<self.imgFileArr[i].files.length)  && (key!==name));
           if (key === name) {
             self.imgFileArr[i][filetype] = files[key];
             break;
           }
         }
       }
     }

     // add files
     for (var i=0; i<fObjArr.length; i++) {
       addFile(fObjArr[i]);
     }

     //
     // now build self.imgFileArr from the internal data structures
     //

     // push ordered DICOMs into self.imgFileArr
     for (var baseUrl in dicoms) {
       self.imgFileArr.push({
        'baseUrl': baseUrl,
        'imgType': 'dicom',
        'files': viewerjs.sortObjArr(dicoms[baseUrl], 'name')
       });
     }

     // push DICOM zip files into self.imgFileArr
     for (baseUrl in dicomZips) {
       self.imgFileArr.push({
        'baseUrl': baseUrl,
        'imgType': 'dicomzip',
        'files': viewerjs.sortObjArr(dicomZips[baseUrl], 'name')
       });
     }

     // push non-DICOM data into self.imgFileArr
     for (i=0; i<nonDcmData.length; i++) {
       self.imgFileArr.push(nonDcmData[i]);
     }

     // add thumbnail images to self.imgFileArr
     assignUtilityFiles(thumbnails, 'thumbnail');

     // add json files to self.imgFileArr
     assignUtilityFiles(jsons, 'json');

     // sort the built array for consistency among possible collaborators
     self.imgFileArr.sort(function(el1, el2) {
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

     // assign an id to each array elem
     for (i=0; i<self.imgFileArr.length; i++) {
       self.imgFileArr[i].id = i;
     }
   };

   /**
    * Append a renderers box to the viewer.
    */
   viewerjs.Viewer.prototype.addRenderersBox = function() {
     var fileManager = null; // cloud file manager
     var contId = this.contId + '_renders';
     var self = this;

     if (this.rBox) {
       return; // renderers box already exists
     }

     // append a div container for the renderers box to the viewer
     this.jqViewer.append('<div id="' + contId + '"></div>');

     // create a renderers box object
     if (this.collab) {fileManager = this.collab.fileManager;}
     this.rBox = new rbox.RenderersBox(contId, fileManager);
     this.rBox.init();

     //
     // renderers box event listeners
     //
     this.rBox.computeMovingHelper = function(evt, target) {
       var thWidth =  $('.view-thumbnail').css('width');
       var thHeight = $('.view-thumbnail').css('height');

       // corresponding thumbnail and renderer have the same integer id
       var id = self.rBox.getRendererId(target.attr('id'));
       var thContId = self.thBar.getThumbnailContId(id);

       // the visually moving helper is a clone of the corresponding thumbnail
       return $('#' + thContId).clone().css({
         display:'block',
         width: thWidth,
         height: thHeight });
     };

     this.rBox.onStart = function() {
       // thumbnails' scroll bar has to be removed to make the moving helper visible
       self.thBar.jqThBar.css({ overflow: 'visible' });
     };

     this.rBox.onBeforeStop = function(evt, ui) {
       var renderId, thId;

       if (ui.placeholder.parent().attr('id') === self.thBar.contId) {
         $(evt.target).sortable('cancel');
         renderId = ui.item.attr('id');
         self.removeRender(renderId);
         self.updateCollabScene();
       }

       // restore thumbnails' scroll bar
       self.thBar.jqThBar.css({ overflow: 'auto' });
     };

     this.rBox.onRenderChange = function() {
       self.updateCollabScene();
     };
   };

   /**
     * Add a renderer to the renderers box.
     *
     * @param {Number} Integer number between 0 and this.imgFileArr.length-1.
     * @param {Function} optional callback whose argument is the renderer object or null.
     */
    viewerjs.Viewer.prototype.addRender = function(imgFileObjId, callback) {
      var self = this;

      if (self.thBar) {
        $('#' + self.thBar.getThumbnailContId(imgFileObjId)).css({ display:"none" });
      }

      self.rBox.add2DRender(self.getImgFileObject(imgFileObjId), 'Z', function(render) {

        if (render) {
          if (self.rBox.numOfRenders===2) {
            // if there are now 2 renderers in the renderers box then show the Link views button
            $('#' + self.toolBar.contId + '_buttonlink').css({display: '' });
          }
        } else if (self.thBar) {
          // could not add renderer so restore the corresponding thumbnail if there is a thumbnail bar
          $('#' + self.thBar.getThumbnailContId(imgFileObjId)).css({ display:"" });
        }

        if (callback) {callback(render);}
      });
    };

    /**
      * Remove a renderer from the renderers box.
      *
      * @param {String} renderer's container.
      */
     viewerjs.Viewer.prototype.removeRender = function(containerId) {

       this.rBox.remove2DRender(containerId);

       if (this.thBar) {
         // corresponding thumbnail and renderer have the same integer id
         var id = this.rBox.getRendererId(containerId);
         var thContId = this.thBar.getThumbnailContId(id);

         // display the removed renderer's thumbnail
         $('#' + thContId).css({ display:'block' });
       }

       // if there is now a single renderer then hide the Link views button
       if (this.rBox.numOfRenders===1) {

         $('#' + this.toolBar.contId + '_buttonlink').css({display: 'none' });

         if (this.rBox.rendersLinked) {
           this.handleToolBarButtonLinkClick();
         }
       }

     };

    /**
     * Create and add a toolbar to the viewer.
     */
    viewerjs.Viewer.prototype.addToolBar = function() {
      var contId = this.contId + '_toolbar';
      var self = this;

      if (this.toolBar) {
        return; // tool bar already exists
      }

      // append a div container for the tool bar to the viewer
      this.jqViewer.append('<div id="' + contId + '"></div>');

      // create a tool bar object
      this.toolBar = new toolbar.ToolBar(contId);
      this.toolBar.init();

      //
      // add buttons to the tool bar
      //
      this.toolBar.addButton({
        id: self.toolBar.contId + '_buttonhelp',
        title: 'Wiki help',
        caption: 'Help',
        onclick: function() {
          window.open('https://github.com/FNNDSC/viewerjs/wiki');
        }
      });

      this.toolBar.addButton({
        id: self.toolBar.contId + '_buttonlink',
        title: 'Link views',
        caption: 'Link views',
        onclick: function() {
          self.handleToolBarButtonLinkClick();
          self.updateCollabScene();
        }
      });
      // hide this button
      this.toolBar.hideButton(this.toolBar.contId + '_buttonlink');

      this.toolBar.addButton({
        id: self.toolBar.contId + '_buttoncollab',
        title: 'Start collaboration',
        caption: 'Start collab',
        onclick: function() {
          if (self.collab.collabIsOn) {
            self.leaveCollaboration();
          } else {
            self.startCollaboration();
          }
        }
      });

      this.toolBar.addButton({
        id: self.toolBar.contId + '_buttonauth',
        title: 'Authorize',
        caption: 'Authorize',
      });
      // hide this button
      this.toolBar.hideButton(this.toolBar.contId + '_buttonauth');

      // tool bar event listeners
      this.handleToolBarButtonLinkClick = function() {
        var jqButton = $('#' + self.toolBar.contId + '_buttonlink');

        if (self.rBox.rendersLinked) {
          self.rBox.rendersLinked = false;
          jqButton.text('Link views');
          jqButton.attr('title', 'Link views');
        } else {
          self.rBox.rendersLinked = true;
          jqButton.text('Unlink views');
          jqButton.attr('title', 'Unlink views');
        }
      };

      // make space for the toolbar
      var rendersTopEdge = parseInt(self.toolBar.jqToolBar.css('top')) + parseInt(self.toolBar.jqToolBar.css('height')) + 5;
      self.rBox.jqRBox.css({ height: 'calc(100% - ' + rendersTopEdge + 'px)' });
      if (self.thBar) {
        // there is a thumbnail bar so make space for it
        var toolLeftEdge = parseInt(self.thBar.jqThBar.css('left')) + parseInt(self.thBar.jqThBar.css('width')) + 5;
        self.toolBar.jqToolBar.css({ width: 'calc(100% - ' + toolLeftEdge + 'px)' });
      }
    };

    /**
     * Create and add a thumbnail bar to the viewer.
     *
     * @param {Function} optional callback to be called when the thumbnail bar is ready
     */
    viewerjs.Viewer.prototype.addThumbnailBar = function(callback) {
      var contId = this.contId + '_thumbnailbar';
      var self = this;

      if (this.thBar) {
        // thumbnail bar already exists
        if (callback) {callback();}
        return;
      }

      // append a div container for the renderers box to the viewer
      this.jqViewer.append('<div id="' + contId + '"></div>');

      // create a thumbnail bar object
      this.thBar = new thbar.ThumbnailBar(contId, this.rBox);
      this.thBar.init(this.imgFileArr, function() {

        // hide any thumbnail with a corresponding renderer (same integer id suffix) already added to the renderers box
        for (var i=0; i<self.rBox.renders2D.length; i++) {

          // corresponding thumbnail and renderer have the same integer id
          var id = self.rBox.getRendererId(self.rBox.renders2D[i].container.id);
          var thContId = self.thBar.getThumbnailContId(id);

          $('#' + thContId).css({ display:"none" });
        }

        if (callback) {callback();}
      });

      // link the thumbnail bar with the renderers box
      this.rBox.setComplementarySortableElem(contId);
      this.thBar.setComplementarySortableElem(this.rBox.contId);

      //
      // thumbnail bar event listeners
      //
      this.thBar.onBeforeStop = function(evt, ui) {

        if (ui.placeholder.parent().attr("id") === self.rBox.contId) {
          $(evt.target).sortable("cancel");

          var id = self.thBar.getThumbnailId(ui.item.attr("id"));

          // add the corresponding renderer (with the same integer id) to the UI
          self.addRender(id, function(render) {
            if (render) {
              self.updateCollabScene();
            } else {
              alert('Reached maximum number of renders allow. You must drag a render out ' +
               'of the viewer window and drop it into the thumbnails bar to make a render available');
            }
          });
        }
      };

      // make space for the thumbnail bar
      var rendersLeftEdge = parseInt(self.thBar.jqThBar.css('left')) + parseInt(self.thBar.jqThBar.css('width')) + 5;
      self.rBox.jqRBox.css({ width: 'calc(100% - ' + rendersLeftEdge + 'px)' });
      if (self.toolBar) {
        // there is a toolbar
        self.toolBar.jqToolBar.css({ width: 'calc(100% - ' + rendersLeftEdge + 'px)' });
      }
    };

    /**
     * Return image file object given its id
     *
     * @param {Number} Integer number between 0 and this.imgFileArr.length-1.
     */
    viewerjs.Viewer.prototype.getImgFileObject = function(id) {
      return this.imgFileArr[id];
    };

    /**
     * Render the current scene.
     */
    viewerjs.Viewer.prototype.renderScene = function() {
      var scene;
      var self = this;

      function renderRenders() {
        var renders2DIds = [];
        var renders2DProps = [];

        function updateRender(render) {
          var id = self.rBox.getRendererId(render.container.id);
          var ix = renders2DIds.indexOf(id);

          // update the volume properties
          render.volume.lowerThreshold = renders2DProps[ix].volume.lowerThreshold;
          render.volume.upperThreshold = renders2DProps[ix].volume.upperThreshold;
          render.volume.windowLow = renders2DProps[ix].volume.lowerWindowLevel;
          render.volume.windowHigh = renders2DProps[ix].volume.upperWindowLevel;
          render.volume.indexX = renders2DProps[ix].volume.indexX;
          render.volume.indexY = renders2DProps[ix].volume.indexY;
          render.volume.indexZ = renders2DProps[ix].volume.indexZ;
          // update the camera
          var obj = JSON.parse(renders2DProps[ix].renderer.viewMatrix);
          var arr = $.map(obj, function(el) { return el; });
          render.camera.view = new Float32Array(arr);
          // update the flip orientation
          render.flipColumns = renders2DProps[ix].renderer.flipColumns;
          render.flipRows = renders2DProps[ix].renderer.flipRows;
          // update the pointing position
          render.pointer = renders2DProps[ix].renderer.pointer;
          // update the slice info HTML
          $('.view-render-info-bottomleft', $(render.container)).html(
            'slice: ' + (render.volume.indexZ + 1) + '/' + render.volume.range[2]);
        }

        // get the collab scene's 2D renderer ids
        for (var i=0; i<scene.renders.length; i++) {
          if (scene.renders[i].general.type = '2D') {
            renders2DIds.push(scene.renders[i].general.id);
            renders2DProps.push(scene.renders[i]);
          }
        }
        // remove the 2D renderers from the local scene that were removed from the collab scene
        for (i=0; i<self.rBox.renders2D.length; i++) {
          var id = self.rBox.getRendererId(self.rBox.renders2D[i].container.id);
          var thContId = self.thBar.getThumbnailContId(id);

          if (renders2DIds.indexOf(id) === -1) {
            $('#' + thContId).css({ display: "block" });
            self.removeRender(self.rBox.renders2D[i].container.id);
          }
        }

        for (i=0; i<renders2DIds.length; i++) {
          // add a 2D renderer to the local scene that was added to the collab scene
          $('#' + self.thBar.getThumbnailContId(renders2DIds[i])).css({ display: "none" });
          self.addRender(renders2DIds[i], updateRender);
        }
      }

      function renderToolbar() {
        if (scene.toolBar) {
          if (!self.toolBar) {
            // no local toolbar so add a toolbar
            self.addToolBar();
            // Update the toolbar's UI
            var collabButton = document.getElementById(self.toolBar.contId + '_buttoncollab');
            collabButton.innerHTML = 'End collab';
            collabButton.title = 'End collaboration';
          }
          if (self.rBox.rendersLinked !== scene.toolBar.rendersLinked) {
            self.handleToolBarButtonLinkClick();
          }
        }
      }

      if (this.collab && this.collab.collabIsOn) {
        // collaboration is on, so get and render the scene
        scene = this.getCollabScene();

        if (scene.thumbnailBar) {
          this.addThumbnailBar(function() {
            renderToolbar();
            renderRenders();
          });
        } else {
          renderToolbar();
          renderRenders();
        }
      } else {
        //  collaboration is off so just load and render the first volume in this.imgFileArr
        for (var i=0; i<this.imgFileArr.length; i++) {
          if (this.imgFileArr[i].imgType==='vol' || this.imgFileArr[i].imgType==='dicom') {
            this.addRender(i);
            break;
          }
        }
      }
    };

    /**
     * Create and return a scene object describing the current scene.
     */
    viewerjs.Viewer.prototype.getLocalScene = function() {
      var scene = {};
      var renders2D = this.rBox.renders2D;

      // set thumbnailbar's properties
      if (this.thBar) {
        scene.thumbnailBar = true;
      }

      // set toolbar's properties
      if (this.toolBar) {
        scene.toolBar = {};
        scene.toolBar.rendersLinked = this.rBox.rendersLinked;
      }

      // set renderers' properties
      // https://docs.google.com/document/d/1GHT7DtSq1ds4TyplA0E2Efy4fuv2xf17APcorqzBZjc/edit
      scene.renders = [];

      // parse each renderer and get information to be synchronized
      for (var j=0; j<renders2D.length; j++) {
        var render = {};

        // set general information about the renderer
        render.general = {};

        render.general.id = this.rBox.getRendererId(renders2D[j].container.id);
        render.general.type = '2D';

        // set renderer specific information
        render.renderer = {};
        render.renderer.viewMatrix = JSON.stringify(renders2D[j].camera.view);
        render.renderer.flipColumns = renders2D[j].flipColumns;
        render.renderer.flipRows = renders2D[j].flipRows;
        render.renderer.pointer = renders2D[j].pointer;

        // set volume specific information
        // only supports 1 volume for now....
        render.volume = {};
        render.volume.file = renders2D[j].volume.file;
        render.volume.lowerThreshold = renders2D[j].volume.lowerThreshold;
        render.volume.upperThreshold = renders2D[j].volume.upperThreshold;
        render.volume.lowerWindowLevel = renders2D[j].volume.windowLow;
        render.volume.upperWindowLevel = renders2D[j].volume.windowHigh;
        render.volume.indexX = renders2D[j].volume.indexX;
        render.volume.indexY = renders2D[j].volume.indexY;
        render.volume.indexZ = renders2D[j].volume.indexZ;

        // set interactor specific information
        render.interactor = {};
        // set camera specific information
        render.camera = {};
        // set pointer specific information
        render.pointer = {};

        scene.renders.push(render);
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

      if (this.collab) {
        var self = this;
        var collabButton = document.getElementById(this.toolBar.contId + '_buttoncollab');
        var authButton = document.getElementById(this.toolBar.contId + '_buttonauth');

        this.collab.authorizeAndLoadApi(true, function(granted) {
          if (granted) {
            // realtime API ready.
            self.collab.startRealtimeCollaboration(self.getLocalScene());
          } else {
            // show the auth button to start the authorization flow
            collabButton.style.display = 'none';
            authButton.style.display = '';

            authButton.onclick = function() {
              self.collab.authorizeAndLoadApi(false, function(granted) {
                if (granted) {
                  // realtime API ready.
                  self.collab.startRealtimeCollaboration(self.getLocalScene());
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
      function loadFile(fUrl, fData) {

        function writeToGdrive(url, data) {
          var name = url.substring(url.lastIndexOf('/') + 1);

          self.collab.fileManager.writeFile(self.collab.dataFilesBaseDir + '/' + name, data, function(fileResp) {
            fObjArr.push({id: fileResp.id, url: url});
            if (fObjArr.length===totalNumFiles) {
              // all data files have been uploaded to GDrive
              self.collab.setDataFileList(fObjArr);
            }
          });
        }

        if (fUrl.search(/.dcm.zip$/i) !== -1) {

          // fData is an array of arrayBuffer so instead of one file now fData.length files need to be uploaded
          totalNumFiles += fData.length-1;
          writeToGdrive(fUrl, fData[0]);

          for (var j=1; j<fData.length; j++) {
            writeToGdrive(fUrl.replace(/.dcm.zip$/i, j+'.dcm.zip'), fData[j]);
          }
        } else {
          // fData is just a single arrayBuffer
          writeToGdrive(fUrl, fData);
        }
      }

      if (this.collab.collaboratorInfo.id === collaboratorInfo.id) {

        if (this.collab.collabOwner) {
          // Update the UI
          var collabButton = document.getElementById(this.toolBar.contId + '_buttoncollab');
          collabButton.style.display = '';
          collabButton.innerHTML = 'End collab';
          collabButton.title = 'End collaboration';
          var authButton = document.getElementById(this.toolBar.contId + '_buttonauth');
          authButton.style.display = 'none';

          // Asyncronously load all files to GDrive
          this.collab.fileManager.createPath(this.collab.dataFilesBaseDir, function() {

            for (var i=0; i<self.imgFileArr.length; i++) {
              var imgFileObj = self.imgFileArr[i];
              var url;

              if (imgFileObj.json) {
                url = imgFileObj.baseUrl + imgFileObj.json.name;
                self.rBox.readFile(imgFileObj.json, 'readAsArrayBuffer', loadFile.bind(null, url));
              }

              if (imgFileObj.files.length > 1) {
                // if there are many files (dicoms) then compress them into a single .zip file before uploading
                url = imgFileObj.baseUrl + imgFileObj.files[0].name + '.zip';
                self.rBox.zipFiles(imgFileObj.files, loadFile.bind(null, url));
              } else {
                url = imgFileObj.baseUrl + imgFileObj.files[0].name;
                self.rBox.readFile(imgFileObj.files[0], 'readAsArrayBuffer', loadFile.bind(null, url));
              }
            }
          });
        } else {
          // insert initial wait text div to manage user expectatives
          $('#' + this.contId).append( '<div id="' + this.contId + '_initwaittext">' +
          'Please wait while loading the viewer...</div>' );
          $('#' + this.contId + '_initwaittext').css( {'color': 'white'} );
        }

        this.startCollaborationChat();
      } else {

        this.chat.updateCollaboratorList();
      }
    };

    /**
     * Handle the onDataFilesShared event when the collaboration owner has shared all data files with this collaborator.
     *
     * @param {Object} collaborator info object with a mail property (collaborator's mail)
     * @param {Object} array of file objects with properties: url and cloudId.
     */
     viewerjs.Viewer.prototype.handleOnDataFilesShared = function(collaboratorInfo, fObjArr) {

      if (this.collab.collaboratorInfo.id === collaboratorInfo.id) {
        var fileArr = [];

        for (var i=0; i<fObjArr.length; i++) {
          fileArr.push({url: fObjArr[i].url, cloudId: fObjArr[i].id});
        }

        // start the viewer
        this.init(fileArr);
      }
    };

    /**
     * Handle the onCollabObjChanged event when the scene object has been modified by a remote collaborator.
     */
     viewerjs.Viewer.prototype.handleOnCollabObjChanged = function() {
       this.renderScene();
     };

    /**
     * Leave the realtime collaboration.
     */
    viewerjs.Viewer.prototype.leaveCollaboration = function() {

      if (this.collab.collabIsOn) {
        this.collab.leaveRealtimeCollaboration();

        // update the UI
        var collabButton = document.getElementById(this.toolBar.contId + '_buttoncollab');
        collabButton.innerHTML = 'Start collab';
        collabButton.title = 'Start collaboration';
        this.chat.destroy();
        this.chat = null;
      }
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
      if (this.toolBar) {
        this.toolBar.destroy();
        this.toolBar = null;
      }
      if (this.thBar) {
        this.thBar.destroy();
        this.thBar = null;
      }
      this.jqViewer = null;
      this.imgFileArr = [];

      // remove html
      $('#' + this.contId).empty();
    };


  return viewerjs;
});
