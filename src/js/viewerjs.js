/**
 * This module takes care of all image visualization and user interface as well as
 * collaboration through the collaborator object injected into viewerjs.Viewer constructor.
 */

// define a new module
define(['jszip', 'jquery_ui', 'dicomParser', 'xtk'], function(jszip) {

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
    viewerjs.Viewer = function(containerID, collab) {

      this.version = 0.0;
      // viewer container's ID
      this.wholeContID = containerID;
      // tool bar container's ID
      this.toolbarContID = this.wholeContID + '_toolbar';
      // thumbnail container's ID
      this.thumbnailbarContID = this.wholeContID + '_thumbnailbar';
      // renderers container's ID
      this.rendersContID =  this.wholeContID + '_renders';
      // list of currently rendered 2D renderer objects
      this.renders2D = [];
      // whether renderers' events are linked
      this.rendersLinked = false;
      // maximum number of renderers
      this.maxNumOfRenders = 4;
      // current number of renderers
      this.numOfRenders = 0;

      // array of image file objects (main viewer's data structure)
      // each object contains the following properties:
      //  -id: Integer, the object's id
      //  -baseUrl: String ‘directory/containing/the/files’
      //  -imgType: String neuroimage type. Any of the possible values returned by viewerjs.Viewer.imgType
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

        // Collaboration event listeners
        var self = this;

        // This is called when the collaboration has successfully started and is ready
        this.collab.onConnect = function(roomId) {
          self.handleOnConnect(roomId);
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
      // Insert initial html. Initially the interface only contains the renderers' container.
      this._addRenderersContainer();
      // build viewer's main data structure (this.imgFileArr)
      this._buildImgFileArr(fObjArr);
      // render the scene
      this.renderScene();
    };

    /**
     * Append the renderers' container to the viewer.
     */
    viewerjs.Viewer.prototype._addRenderersContainer = function() {
      var self = this;

      $('#' + this.wholeContID).css({
        'position': 'relative',
        'margin': 0,
        '-webkit-box-sizing': 'border-box',
        '-moz-box-sizing': 'border-box',
        'box-sizing': 'border-box'
      }).append('<div id="' + this.rendersContID + '" class="view-renders ' + this.wholeContID + '-sortable"></div>' );

      // jQuery UI options object for sortable elems
      // ui-sortable CSS class is by default added to the containing elem
      // an elem being moved is assigned the ui-sortable-helper class
      var sort_opts = {
        cursor: 'move',
        distance: '60', // required moving distance before the displacement is taken into account
        containment: '#' + this.wholeContID, // CSS selector within which elem displacement is restricted
        appendTo: '#' + this.thumbnailbarContID, // CSS selector giving the receiver container for the moving clone
        connectWith: '.' + this.wholeContID + '-sortable', // CSS selector representing the elems in which we can insert these elems.
        dropOnEmpty: true,

        helper: function (evt, target) {
          var thWidth =  $('.view-thumbnail').css('width');
          var thHeight = $('.view-thumbnail').css('height');
          var renderId = target.attr('id');
          var thId = renderId.replace(self.rendersContID + '_render2D', self.thumbnailbarContID + '_th');

          // the moving helper is a clone of the corresponding thumbnail
          return $('#' + thId).clone().css({
            display:'block',
            width: thWidth,
            height: thHeight });
        },

        //event handlers
        start: function() {
          // thumbnails' scroll bar has to be removed to make the moving helper visible
          $('#' + self.thumbnailbarContID).css({ overflow: 'visible' });
        },

        beforeStop: function(evt, ui) {
          var renderId, thId;

          if (ui.placeholder.parent().attr('id') === self.thumbnailbarContID) {
            $(this).sortable('cancel');
            renderId = ui.item.attr('id');
            thId = renderId.replace(self.rendersContID + '_render2D', self.thumbnailbarContID + '_th');
            // display the dropped renderer's thumbnail
            $('#' + thId).css({ display:'block' });
            self.remove2DRender(renderId);
            self.updateCollabScene();
          }
          // restore thumbnails' scroll bar
          $('#' + self.thumbnailbarContID).css({ overflow: 'auto' });
        }
      };

      // make the renderers' container sortable
      $('#' + this.rendersContID).sortable(sort_opts);
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

       imgType = viewerjs.Viewer.imgType(file);

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
     * Create and add a 2D renderer with a loaded volume to the renderers' container.
     *
     * @param {Oject} Image file object.
     * @param {String} X, Y or Z orientation.
     * @param {Function} optional callback whose argument is the 2D renderer object.
     */
    viewerjs.Viewer.prototype.add2DRender = function(imgFileObj, orientation, callback) {
      var render, vol, containerID;
      var volProps = {};
      var self = this;

      // the renderer's id is related to the imgFileObj's id
      containerID = this.rendersContID + "_render2D" + imgFileObj.id;
      if ($('#' + containerID).length) {
        // renderer already added
        if (callback) {
          callback(self.renders2D.filter(function(rendr) {return rendr.container.id === containerID;})[0]);
        }
        return;
      }

      // append renderer div to the renderers' container
      $('#' + this.rendersContID).append(
        '<div id="' + containerID + '" class="view-render">' +
          '<div class="view-render-info view-render-info-topleft"></div>' +
          '<div class="view-render-info view-render-info-topright"></div>' +
          '<div class="view-render-info view-render-info-bottomright"></div>' +
          '<div class="view-render-info view-render-info-bottomleft"></div>' +
        '</div>'
      );

      // rearrange layout
      ++this.numOfRenders;
      // if there is now two renderers then show the Link views button
      if (this.numOfRenders===2) {
        $('#' + this.toolbarContID + '_buttonlink').css({display: '' });
      }
      this.positionRenders();

      //
      // create xtk objects
      //

      render = this.create2DRender(containerID, orientation);

      // define XTK volume properties for the passed orientation
      volProps.index = 'index' + orientation;
      switch(orientation) {
        case 'X':
          volProps.rangeInd = 0;
        break;
        case 'Y':
          volProps.rangeInd = 1;
        break;
        case 'Z':
          volProps.rangeInd = 2;
        break;
      }

      // renderer's event handlers
      this.onRender2DScroll = function(evt) {

        function updateSliceInfoHTML(render) {
          $('.view-render-info-bottomleft', $(render.container)).html(
            'slice: ' + (render.volume[volProps.index] + 1) + '/' + render.volume.range[volProps.rangeInd]);
        }

        if (self.rendersLinked) {
          for (var i=0; i<self.renders2D.length; i++) {
            if (self.renders2D[i].interactor !== evt.target) {
              if (evt.up) {
                self.renders2D[i].volume[volProps.index]++;
              } else {
                self.renders2D[i].volume[volProps.index]--;
              }
            }
            updateSliceInfoHTML(self.renders2D[i]);
          }
        } else {
          updateSliceInfoHTML(self.renders2D.filter(function(rendr) {return rendr.interactor === evt.target;})[0]);
        }

        self.updateCollabScene();
      };

      this.onRender2DZoom = function() {
        self.updateCollabScene();
      };

      this.onRender2DPan = function() {
        self.updateCollabScene();
      };

      this.onRender2DRotate = function() {
        self.updateCollabScene();
      };

      this.onRender2DFlipColumns = function() {
        // press W to trigger this event
        render.flipColumns = !render.flipColumns;
        self.updateCollabScene();
      };

      this.onRender2DFlipRows = function() {
        // press Q to trigger this event
        render.flipRows = !render.flipRows;
        self.updateCollabScene();
      };

      this.onRender2DPoint = function() {
        self.updateCollabScene();
      };

      // bind event handler callbacks with the renderer's interactor
      render.interactor.addEventListener(X.event.events.SCROLL, this.onRender2DScroll);
      render.interactor.addEventListener(X.event.events.ZOOM, this.onRender2DZoom);
      render.interactor.addEventListener(X.event.events.PAN, this.onRender2DPan);
      render.interactor.addEventListener(X.event.events.ROTATE, this.onRender2DRotate);
      render.interactor.addEventListener("flipColumns", this.onRender2DFlipColumns);
      render.interactor.addEventListener("flipRows", this.onRender2DFlipRows);

      // called every time the pointing position is changed with shift+left-mouse
      render.addEventListener("onPoint", this.onRender2DPoint);

      // the onShowtime event handler gets executed after all files were fully loaded and
      // just before the first rendering attempt
      render.onShowtime = function() {

        // define function to set the UI mri info
        function setUIMriInfo(info) {
          var jqR = $('#' + containerID);
          var age = '', orient = '', direct = '';

          if (info.patientAge) {
            age =  'AGE: ' + info.patientAge + '<br>';
          }
          $('.view-render-info-topleft', jqR).html(
            info.patientName + '<br>' +
            info.patientId + '<br>' +
            'BIRTHDATE: ' + info.patientBirthDate + '<br>' +
            age +
            'SEX: ' + info.patientSex );

          $('.view-render-info-topright', jqR).html(
            'SERIES: ' + info.seriesDescription + '<br>' +
            info.manufacturer + '<br>' +
            info.studyDate + '<br>' +
            info.dimensions + '<br>' +
            info.voxelSizes );

          if (info.orientation) {
              orient = info.orientation + '<br>';
          }
          if (info.primarySliceDirection) {
            direct = info.primarySliceDirection;
          }
          $('.view-render-info-bottomright', jqR).html(
            orient + direct );

          $('.view-render-info-bottomleft', jqR).html(
            'slice: ' + (vol[volProps.index] + 1) + '/' + vol.range[volProps.rangeInd]);

          // renderer is ready
          if (callback) {callback(render);}
        }

        // define function to read the json file
        function readJson(file, callback) {
          self.readFile(file, 'readAsText', function(data) {
            callback(JSON.parse(data));
          });
        }

        if (imgFileObj.json) {
          // if there is a json file then read it
          readJson(imgFileObj.json, function(jsonObj) {
            var mriInfo = {
              patientName: jsonObj.PatientName,
              patientId: jsonObj.PatientID,
              patientBirthDate: jsonObj.PatientBirthDate,
              patientSex: jsonObj.PatientSex,
              seriesDescription: jsonObj.SeriesDescription,
              manufacturer: jsonObj.Manufacturer,
              studyDate: jsonObj.StudyDate,
              orientation: jsonObj.mri_info.orientation,
              primarySliceDirection: jsonObj.mri_info.primarySliceDirection,
              dimensions: jsonObj.mri_info.dimensions,
              voxelSizes: jsonObj.mri_info.voxelSizes
            };
            setUIMriInfo(mriInfo);
          });
        } else if (imgFileObj.dicomInfo) {
          // if instead there is dicom information then use it
          var mriInfo = imgFileObj.dicomInfo;
          mriInfo.dimensions = (vol.range[0]) + ' x ' + (vol.range[1]) + ' x ' + (vol.range[2]);
          mriInfo.voxelSizes = vol.spacing[0].toPrecision(4) + ', ' + vol.spacing[1].toPrecision(4) +
          ', ' + vol.spacing[2].toPrecision(4);
          setUIMriInfo(mriInfo);
        } else {
          // just display slice number
          $('.view-render-info-bottomleft', $('#' + containerID)).html(
            'slice: ' + (vol[volProps.index] + 1) + '/' + vol.range[volProps.rangeInd]);

          // renderer is ready
          if (callback) {callback(render);}
        }
      };

      // create xtk volume and link it to its render
      vol = this.createVolume(imgFileObj);
      render.volume = vol;

      // add xtk 2D renderer to the list of current UI renders
      this.renders2D.push(render);

      // function to read an MRI file
      var numFiles = 0;
      var filedata = [];
      function readMriFile(file, pos) {

        self.readFile(file, 'readAsArrayBuffer', function(data) {
          filedata[pos] = data;
          ++numFiles;

          if (numFiles===imgFileObj.files.length) {

            if (imgFileObj.imgType === 'dicom' || imgFileObj.imgType === 'dicomzip') {

              // if the files are zip files of dicoms then unzip them and sort the resultant files
              if (imgFileObj.imgType === 'dicomzip') {
                var fDataArr = [];

                for (var i=0; i<filedata.length; i++) {
                  fDataArr = fDataArr.concat(self.unzipFileData(filedata[i]));
                }
                fDataArr = viewerjs.sortObjArr(fDataArr, 'name');

                filedata = [];
                var urls = [];
                for (i=0; i<fDataArr.length; i++) {
                  filedata.push(fDataArr[i].data);
                  urls.push(imgFileObj.baseUrl + fDataArr[i].name);
                }
                vol.file = urls;
              }

              try {
                imgFileObj.dicomInfo = viewerjs.Viewer.parseDicom(filedata[0]);
              } catch(err) {
                console.log('Could not parse dicom ' + imgFileObj.baseUrl + ' Error - ' + err);
              }
            }

            vol.filedata = filedata;
            render.add(vol);
            // start the rendering
            render.render();
            viewerjs.documentRepaint();
          }
        });
      }

      // read all neuroimage files in imgFileObj.files
      for (var i=0; i<imgFileObj.files.length; i++) {
        readMriFile(imgFileObj.files[i], i);
      }

    };

    /**
     * Remove a 2D renderer from the UI.
     *
     * @param {String} renderer's container.
     */
    viewerjs.Viewer.prototype.remove2DRender = function(containerID) {

      // find and destroy xtk objects and remove the renderer's div from the UI
      for (var i=0; i<this.renders2D.length; i++) {
        if ($(this.renders2D[i].container).attr('id') === containerID) {
          this.renders2D[i].remove(this.renders2D[i].volume);
          this.renders2D[i].volume.destroy();
          this.renders2D[i].interactor.removeEventListener(X.event.events.SCROLL, this.onRender2DScroll);
          this.renders2D[i].interactor.removeEventListener(X.event.events.ZOOM, this.onRender2DZoom);
          this.renders2D[i].interactor.removeEventListener(X.event.events.PAN, this.onRender2DPan);
          this.renders2D[i].interactor.removeEventListener(X.event.events.ROTATE, this.onRender2DRotate);
          this.renders2D[i].interactor.removeEventListener("flipColumns", this.onRender2DFlipColumns);
          this.renders2D[i].interactor.removeEventListener("flipRows", this.onRender2DFlipRows);
          this.renders2D[i].removeEventListener("onPoint", this.onRender2DPoint);
          this.renders2D[i].destroy();
          this.renders2D.splice(i, 1);
          $('#' + containerID).remove();
          --this.numOfRenders;
          // if there is now a single renderer then hide the Link views button
          if (this.numOfRenders===1) {
            $('#' + this.toolbarContID + '_buttonlink').css({display: 'none' });
            if (this.rendersLinked) {
              this.handleToolBarButtonLinkClick();
            }
          }
          this.positionRenders();
          viewerjs.documentRepaint();
          break;
        }
      }

    };

    /**
     * Create an xtk 2D renderer object.
     *
     * @param {String} container id.
     * @param {String} X, Y or Z orientation.
     *
     * @return {string} the newly created render object.
     * @public
     */
    viewerjs.Viewer.prototype.create2DRender = function(containerID, orientation) {
      var render;

      // create xtk object
      render = new X.renderer2D();
      render.container = containerID;
      render.bgColor = [0.2, 0.2, 0.2];
      render.orientation = orientation;
      render.init();
      return render;
    };

    /**
     * Create an xtk volume object.
     *
     * @param {Object} image file object
     */
    viewerjs.Viewer.prototype.createVolume = function(imgFileObj) {
      var fileNames = [];

      if (imgFileObj.imgType === 'dicomzip') {
        for (var i=0; i<imgFileObj.files.length; i++) {
          fileNames[i] = imgFileObj.files[i].name.replace('.zip', '');
        }
      } else {
        for (var j=0; j<imgFileObj.files.length; j++) {
          fileNames[j] = imgFileObj.files[j].name;
        }
      }
      // create xtk object
      var vol = new X.volume();
      vol.reslicing = 'false';
      vol.file = fileNames.sort().map(function(str) {
        return imgFileObj.baseUrl + str;});

      return vol;
    };

    /**
     * Rearrange renderers in the UI layout.
     */
    viewerjs.Viewer.prototype.positionRenders = function() {
      // sort by id
      var jqRenders = viewerjs.sortObjArr($('div.view-render', $('#' + this.rendersContID)), 'id');

      switch(this.numOfRenders) {
        case 1:
          jqRenders.css({
            width: '100%',
            height: '100%',
            top: 0,
            left: 0
          });
        break;

        case 2:
          jqRenders.css({
            width: '50%',
            height: '100%',
            top: 0,
            left:0
          });
          jqRenders[1].style.left = '50%';
        break;

        case 3:
          jqRenders.css({
            width: '50%',
            height: '50%',
          });
          jqRenders[0].style.top = 0;
          jqRenders[0].style.left = 0;
          jqRenders[1].style.top = 0;
          jqRenders[1].style.left = '50%';
          jqRenders[2].style.top = '50%';
          jqRenders[2].style.left = 0;
          jqRenders[2].style.width = '100%';
        break;

        case 4:
          jqRenders.css({
            width: '50%',
            height: '50%',
          });
          jqRenders[0].style.top = 0;
          jqRenders[0].style.left = 0;
          jqRenders[1].style.top = 0;
          jqRenders[1].style.left = '50%';
          jqRenders[2].style.top = '50%';
          jqRenders[2].style.left = 0;
          jqRenders[3].style.top = '50%';
          jqRenders[3].style.left = '50%';
        break;
      }
    };

    /**
     * Create and add a toolbar to the viewer.
     */
    viewerjs.Viewer.prototype.addToolBar = function() {
      var self = this;

      if ($('#' + this.toolbarContID).length) {
        return; // toolbar already exists
      }

      // append toolbar div and it's buttons to the whole container
      $('#' + this.wholeContID).append(
        '<div id="' + this.toolbarContID + '" class="view-toolbar">' +
          '<button id="' + this.toolbarContID + '_buttonlink" class="view-toolbar-button" type="button" title="Link views">Link views</button>' +
          '<button id="' + this.toolbarContID + '_buttoncollab" class="view-toolbar-button" type="button" title="Start collaboration">Start collab</button>' +
          '<button id="' + this.toolbarContID + '_buttonauth" class="view-toolbar-button" type="button" title="Authorize">Authorize</button>' +
          '<label id="' + this.toolbarContID + '_labelcollab" class="view-toolbar-label"></label>' +
        '<div>'
      );
      // hide the authorize button
      $('#' + this.toolbarContID + '_buttonauth').css({display: 'none' });
      // hide the Link views button
      $('#' + this.toolbarContID + '_buttonlink').css({display: 'none' });

      // make space for the toolbar
      var jqToolCont = $('#' + this.toolbarContID);
      var rendersTopEdge = parseInt(jqToolCont.css('top')) + parseInt(jqToolCont.css('height')) + 5;
      $('#' + this.rendersContID).css({ height: 'calc(100% - ' + rendersTopEdge + 'px)' });
      if ($('#' + this.thumbnailbarContID).length) {
        // there is a thumbnail bar so make space for it
        var jqThCont = $('#' + this.thumbnailbarContID);
        var toolLeftEdge = parseInt(jqThCont.css('left')) + parseInt(jqThCont.css('width')) + 5;
        jqToolCont.css({ width: 'calc(100% - ' + toolLeftEdge + 'px)' });
      }

      //
      // event handlers
      //
      this.handleToolBarButtonLinkClick = function() {
        var jqButton = $('#' + this.toolbarContID + '_buttonlink');

        if (self.rendersLinked) {
          self.rendersLinked = false;
          jqButton.text('Link views');
          jqButton.attr('title', 'Link views');
        } else {
          self.rendersLinked = true;
          jqButton.text('Unlink views');
          jqButton.attr('title', 'Unlink views');
        }
      };

      $('#' + this.toolbarContID + '_buttonlink').click(function() {
        //handle the event
        self.handleToolBarButtonLinkClick();
        self.updateCollabScene();
      });

      $('#' + this.toolbarContID + '_buttoncollab').click(function() {
        if (self.collab.collabIsOn) {
          self.leaveCollaboration();
        } else {
          self.startCollaboration();
        }
      });

    };

    /**
     * Create and add a thumbnail bar to the viewer.
     *
     * @param {Function} optional callback to be called when the thumbnail bar is ready
     */
    viewerjs.Viewer.prototype.addThumbnailBar = function(callback) {
      var numLoadedThumbnails = 0;
      var self = this;

      // return if less than 2 files (doesn't need a thumbnail bar) or if thumbnail bar already exists
      if ((this.imgFileArr.length<2) || $('#' + this.thumbnailbarContID).length) {
        if (callback) {callback();}
        return;
      }

      // append thumbnailbar to the whole container
      $('#' + this.wholeContID).append(
        '<div id="' + this.thumbnailbarContID + '" class="view-thumbnailbar ' + this.wholeContID + '-sortable"></div>'
      );

      // make the thumbnails container sortable
      var sort_opts = {
        cursor: 'move',
        containment: '#' + this.wholeContID,
        helper: 'clone',
        appendTo: '#' + this.rendersContID,
        connectWith: '.' + this.wholeContID + '-sortable',
        dropOnEmpty: true,

        //event handlers
        // beforeStop is called when the placeholder is still in the list
        beforeStop: function(event, ui) {
          if (ui.placeholder.parent().attr("id") === self.rendersContID) {
            $(this).sortable("cancel");
            if (self.numOfRenders < self.maxNumOfRenders) {
              // a dropped thumbnail disappears from thumbnail bar
              var id = parseInt(ui.item.css({ display:"none" }).attr("id").replace(self.thumbnailbarContID + "_th",""));
              // add a renderer to the UI containing a volume with the same id suffix as the thumbnail
              self.add2DRender(self.getImgFileObject(id), 'Z', function() {
                self.updateCollabScene();
              });
            } else {
              alert('Reached maximum number of renders allow which is 4. You must drag a render out ' +
               'of the viewer window and drop it into the thumbnails bar to make a render available');
            }
          }
        }
      };

      $('#' + this.thumbnailbarContID).sortable(sort_opts);

      // make space for the thumbnail bar
      var jqThBarCont = $('#' + this.thumbnailbarContID);
      var rendersLeftEdge = parseInt(jqThBarCont.css('left')) + parseInt(jqThBarCont.css('width')) + 5;
      $('#' + this.rendersContID).css({ width: 'calc(100% - ' + rendersLeftEdge + 'px)' });
      if ($('#' + this.toolbarContID).length) {
        // there is a toolbar
        $('#' + this.toolbarContID).css({ width: 'calc(100% - ' + rendersLeftEdge + 'px)' });
      }

      // function to load the thumbnail corresponding to the imgFileObj argument
      // if there is a thumbnail property in the imgFileObj then load it otherwise
      // automatically create the thumbnail from a renderer's canvas object
      function loadThumbnail(imgFileObj) {
        var fname, info, title, thContJq, imgJq;
        var id = imgFileObj.id;

        // we assume the name of the thumbnail can be of the form:
        // 1.3.12.2.1107.5.2.32.35288.30000012092602261631200043880-AXIAL_RFMT_MPRAGE-Sag_T1_MEMPRAGE_1_mm_4e_nomoco.jpg
        if (imgFileObj.thumbnail) {
          fname = imgFileObj.thumbnail.name;
        } else if (imgFileObj.imgType !== 'dicom'){
          fname = imgFileObj.files[0].name;
        } else {
          fname = ''; title = ''; info = '';
        }
        if (fname) {
          if (fname.lastIndexOf('-') !== -1) {
            title = fname.substring(0, fname.lastIndexOf('.'));
            title = title.substring(title.lastIndexOf('-') + 1);
            info = title.substr(0, 10);
          } else {
            title = fname;
            info = fname.substring(0, fname.lastIndexOf('.')).substr(-10);
          }
        }

        // append this thumbnail to thumbnailbar
        $('#' + self.thumbnailbarContID).append(
          '<div id="' + self.thumbnailbarContID + '_th' + id + '" class="view-thumbnail">' +
            '<img class="view-thumbnail-img" title="' + title + '">' +
            '<div class="view-thumbnail-info">' + info + '</div>' +
          '</div>'
        );
        thContJq = $('#' + self.thumbnailbarContID + '_th' + id);
        imgJq = $('.view-thumbnail-img', thContJq);

        // internal function to read the thumbnail's url so it can be assigned to the src of <img>
        function readThumbnailUrl(thumbnail) {
          self.readFile(thumbnail, 'readAsDataURL', function(data) {
            imgJq.attr('src', data);
            // if there is a corresponding renderer window already in the UI then hide this thumbnail
            if ($('#' + self.rendersContID + '_render2D' + id).length) {
              thContJq.css({ display:"none" });
            }
            if (++numLoadedThumbnails === self.imgFileArr.length) {
              // all thumbnails loaded
              if (callback) {callback();}
            }
          });
        }

        // internal function to create and read the thumbnails' url so it can be assigned to the src of <img>
        function createAndReadThumbnailUrl() {
          var filedata = [];
          var numFiles = 0;
          var vol = self.createVolume(imgFileObj);
          var render;
          var tempRenderContId = thContJq.attr('id') + '_temp';
          var imgWidth = imgJq.css('width');
          var imgHeight = imgJq.css('height');

          // hide the <img> and prepend a div for a renderer canvas with the same size as the hidden <img>
          imgJq.css({ display:'none' });
          thContJq.prepend('<div id="' + tempRenderContId + '"></div>');
          $('#' + tempRenderContId).css({ width: imgWidth, height: imgHeight });
          render = self.create2DRender(tempRenderContId, 'Z');

          render.afterRender = function() {
            var canvas = $('#' + tempRenderContId + ' > canvas')[0];

            self.readFile(viewerjs.dataURItoJPGBlob(canvas.toDataURL('image/jpeg')), 'readAsDataURL', function(data) {
              imgJq.attr('src', data);
              render.remove(vol);
              vol.destroy();
              $('#' + tempRenderContId).remove();
              render.destroy();
              // restore the hidden <img>
              imgJq.css({ display:'block' });
              // if there is a corresponding renderer window already in the UI then hide this thumbnail
              if ($('#' + self.rendersContID + '_render2D' + id).length) {
                thContJq.css({ display:'none' });
              }
              if (++numLoadedThumbnails === self.imgFileArr.length) {
                // all thumbnails loaded
                if (callback) {callback();}
              }
            });
          };

          function readFile(file, pos) {
            self.readFile(file, 'readAsArrayBuffer', function(data) {
              filedata[pos] = data;

              if (++numFiles === imgFileObj.files.length) {
                // all files have been read
                if (imgFileObj.imgType === 'dicom' || imgFileObj.imgType === 'dicomzip') {

                  // if the files are zip files of dicoms then unzip them and sort the resultant files
                  if (imgFileObj.imgType === 'dicomzip') {
                    var fDataArr = [];

                    for (var i=0; i<filedata.length; i++) {
                      fDataArr = fDataArr.concat(self.unzipFileData(filedata[i]));
                    }
                    fDataArr = viewerjs.sortObjArr(fDataArr, 'name');

                    filedata = [];
                    var urls = [];
                    for (i=0; i<fDataArr.length; i++) {
                      filedata.push(fDataArr[i].data);
                      urls.push(imgFileObj.baseUrl + fDataArr[i].name);
                    }
                    vol.file = urls;
                  }

                  //update the thumbnail info with the series description
                  var byteArray = new Uint8Array(filedata[0]);
                  try {
                    var dataSet = dicomParser.parseDicom(byteArray);
                    title = dataSet.string('x0008103e');
                    info = title.substr(0, 10);
                    imgJq.attr('title', title);
                    $('.view-thumbnail-info', thContJq).text(info);
                  } catch(err) {
                    console.log('Could not parse dicom ' + imgFileObj.baseUrl + ' Error - ' + err);
                  }
                }

                vol.filedata = filedata;
                render.add(vol);
                // start the rendering
                render.render();
              }
            });
          }

          // read all files belonging to the volume
          for (var i=0; i<imgFileObj.files.length; i++) {
            readFile(imgFileObj.files[i], i);
          }
        }

        if (imgFileObj.thumbnail) {
          readThumbnailUrl(imgFileObj.thumbnail);
        } else {
          createAndReadThumbnailUrl();
        }

      }

      // load thumbnail images and create their UIs when ready
      for (var i=0; i<this.imgFileArr.length; i++) {
        loadThumbnail(this.imgFileArr[i]);
      }

    };

    /**
     * Destroy all objects and remove html interface
     */
    viewerjs.Viewer.prototype.destroy = function() {
      // destroy XTK renderers
      for (var i=0; i<this.renders2D.length; i++) {
        this.remove2DRender($(this.renders2D[i].container).attr("id"));
      }
      // remove html
      $('#' + this.wholeContID).empty();
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
          var id = parseInt(render.container.id.replace(self.rendersContID + "_render2D", ""));
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
        for (i=0; i<self.renders2D.length; i++) {
          var id = parseInt(self.renders2D[i].container.id.replace(self.rendersContID + "_render2D", ""));

          if (renders2DIds.indexOf(id) === -1) {
            $('#' + self.thumbnailbarContID + '_th' + id).css({ display: "block" });
            self.remove2DRender(self.rendersContID + "_render2D" + id);
          }
        }

        for (i=0; i<renders2DIds.length; i++) {
          // add a 2D renderer to the local scene that was added to the collab scene
          $('#' + self.thumbnailbarContID + '_th' + renders2DIds[i]).css({ display: "none" });
          self.add2DRender(self.getImgFileObject(renders2DIds[i]), 'Z', updateRender);
        }
      }

      function renderToolbar() {
        if (scene.toolBar) {
          if ($('#' + self.toolbarContID).length===0) {
            // no local toolbar so add a toolbar
            self.addToolBar();
            // Update the toolbar's UI
            var collabButton = document.getElementById(self.toolbarContID + '_buttoncollab');
            collabButton.innerHTML = 'End collab';
            collabButton.title = 'End collaboration';
            var roomIdLabel = document.getElementById(self.toolbarContID + '_labelcollab');
            roomIdLabel.innerHTML = self.collab.realtimeFileId;
          }
          if (self.rendersLinked !== scene.toolBar.rendersLinked) {
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
            this.add2DRender(this.imgFileArr[i], 'Z');
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

      // set thumbnailbar's properties
      scene.thumbnailBar = $('#' + this.thumbnailbarContID).length;

      // set toolbar's properties
      if ($('#' + this.toolbarContID).length) {
        scene.toolBar = {};
        scene.toolBar.rendersLinked = this.rendersLinked;
      }

      // set renderers' properties
      // https://docs.google.com/document/d/1GHT7DtSq1ds4TyplA0E2Efy4fuv2xf17APcorqzBZjc/edit
      scene.renders = [];

      // parse each renderer and get information to be synchronized
      for (var j=0; j<this.renders2D.length; j++) {
        var render = {};

        // set general information about the renderer
        render.general = {};
        render.general.id = parseInt(this.renders2D[j].container.id.replace(this.rendersContID + '_render2D', ''));
        render.general.type = '2D';

        // set renderer specific information
        render.renderer = {};
        render.renderer.viewMatrix = JSON.stringify(this.renders2D[j].camera.view);
        render.renderer.flipColumns = this.renders2D[j].flipColumns;
        render.renderer.flipRows = this.renders2D[j].flipRows;
        render.renderer.pointer = this.renders2D[j].pointer;

        // set volume specific information
        // only supports 1 volume for now....
        render.volume = {};
        render.volume.file = this.renders2D[j].volume.file;
        render.volume.lowerThreshold = this.renders2D[j].volume.lowerThreshold;
        render.volume.upperThreshold = this.renders2D[j].volume.upperThreshold;
        render.volume.lowerWindowLevel = this.renders2D[j].volume.windowLow;
        render.volume.upperWindowLevel = this.renders2D[j].volume.windowHigh;
        render.volume.indexX = this.renders2D[j].volume.indexX;
        render.volume.indexY = this.renders2D[j].volume.indexY;
        render.volume.indexZ = this.renders2D[j].volume.indexZ;

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
        var collabButton = document.getElementById(this.toolbarContID + '_buttoncollab');
        var authButton = document.getElementById(this.toolbarContID + '_buttonauth');

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
     * Handle the onConnect event when the collaboration has successfully started and is ready.
     *
     * @param {String} roomId (realtime model file id).
     */
    viewerjs.Viewer.prototype.handleOnConnect = function(roomId) {
      var self = this;

      console.log('collaborationIsOn: ', this.collab.collabIsOn);
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

          self.collab.driveFm.writeFile(self.collab.dataFilesBaseDir + '/' + name, data, function(fileResp) {
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

      if (this.collab.collabOwner) {
        // Update the UI
        var collabButton = document.getElementById(this.toolbarContID + '_buttoncollab');
        collabButton.style.display = '';
        collabButton.innerHTML = 'End collab';
        collabButton.title = 'End collaboration';
        var authButton = document.getElementById(this.toolbarContID + '_buttonauth');
        authButton.style.display = 'none';
        var roomIdLabel = document.getElementById(this.toolbarContID + '_labelcollab');
        roomIdLabel.innerHTML = roomId;

        // Asyncronously load all files to GDrive
        this.collab.driveFm.createPath(this.collab.dataFilesBaseDir, function() {

          for (var i=0; i<self.imgFileArr.length; i++) {
            var imgFileObj = self.imgFileArr[i];
            var url;

            if (imgFileObj.json) {
              url = imgFileObj.baseUrl + imgFileObj.json.name;
              self.readFile(imgFileObj.json, 'readAsArrayBuffer', loadFile.bind(null, url));
            }

            if (imgFileObj.files.length > 1) {
              // if there are many files (dicoms) then compress them into a single .zip file before uploading
              url = imgFileObj.baseUrl + imgFileObj.files[0].name + '.zip';
              self.zipFiles(imgFileObj.files, loadFile.bind(null, url));
            } else {
              url = imgFileObj.baseUrl + imgFileObj.files[0].name;
              self.readFile(imgFileObj.files[0], 'readAsArrayBuffer', loadFile.bind(null, url));
            }
          }
        });
      }
    };

    /**
     * Handle the onDataFilesShared event when the collaboration owner has shared all data files with this collaborator.
     *
     * @param {Object} collaborator info object with a mail property (collaborator's mail)
     * @param {Object} array of file objects with properties: url and cloudId.
     */
     viewerjs.Viewer.prototype.handleOnDataFilesShared = function(collaboratorInfo, fObjArr) {

      if (!this.collab.collabOwner && (this.collab.collaboratorInfo.mail === collaboratorInfo.mail)) {
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
     *
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
        console.log('collaborationIsOn: ', this.collab.collabIsOn);

        // update the UI
        var collabButton = document.getElementById(this.toolbarContID + '_buttoncollab');
        collabButton.innerHTML = 'Start collab';
        collabButton.title = 'Start collaboration';
        var roomIdLabel = document.getElementById(this.toolbarContID + '_labelcollab');
        roomIdLabel.innerHTML = '';
      }
    };

    /**
     * Read a local or remote file.
     *
     * @param {Object} HTML5 file object or an object containing properties:
     *  -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *  -url the file's url
     *  -clouId: the id of the file in a cloud storage system if stored in the cloud
     * @param {String} reading method.
     * @param {Function} callback whose argument is the file data.
     */
    viewerjs.Viewer.prototype.readFile = function(file, readingMethod, callback) {
      var reader = new FileReader();
      var self = this;

      reader.onload = function() {
        callback(reader.result);
      };

      if (file.remote) {
        if (file.cloudId) {
          self.collab.driveFm.getFileBlob(file.cloudId, function(blob) {
            reader[readingMethod](blob);
          });
        } else {
          viewerjs.urlToBlob(file.url, function(blob) {
            reader[readingMethod](blob);
          });
        }
      } else {
        reader[readingMethod](file);
      }
    };

    /**
     * Zip the contents of several files into a few zip file contents. Maximum size for
     * each resultant zip file contents is 20 MB.
     *
     * @param {Array} Array of HTML5 file objects or objects containing properties:
     *  -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *  -url the file's url
     *  -cloudId: the id of the file in a cloud storage system if stored in the cloud
     * @param {Function} callback whose argument is an array of arrayBuffer. Each entry of the
     * array contains the data for a single zip file.
     */
    viewerjs.Viewer.prototype.zipFiles = function(fileArr, callback) {
      var url, fileName;
      var fileDataArr = [];

      function zipFiles() {
        var zip = jszip();
        var zipDataArr = [];
        var contents;
        var byteLength = 0;

        for (var i=0; i<fileDataArr.length; i++) {
          // maximum zip file size is 20 MB
          if (byteLength + fileDataArr[i].data.byteLength <= 20971520) {
            byteLength += fileDataArr[i].data.byteLength;
            zip.file(fileDataArr[i].name, fileDataArr[i].data);
          } else {
            // generate the zip file contents for the current chunk of files
            contents = zip.generate({type:"arraybuffer"});
            zipDataArr.push(contents);
            // create a new zip for the next chunk of files
            zip = jszip();
            byteLength = fileDataArr[i].data.byteLength;
            zip.file(fileDataArr[i].name, fileDataArr[i].data);
          }
          // generate the zip file contents for the last chunk of files
          if (i+1>=fileDataArr.length) {
            contents = zip.generate({type:"arraybuffer"});
            zipDataArr.push(contents);
          }
        }

        return zipDataArr;
      }

      function addFile(fName, fData) {
        fileDataArr.push({name: fName, data: fData});

        if (fileDataArr.length === fileArr.length) {
          // all files have been read so generate the zip files' contents
          callback(zipFiles());
        }
      }

      for (var i=0; i<fileArr.length; i++) {
        if (fileArr[i].remote) {
          url = fileArr[i].url;
          fileName = url.substring(url.lastIndexOf('/') + 1);
        } else {
          fileName = fileArr[i].name;
        }
        this.readFile(fileArr[i], 'readAsArrayBuffer', addFile.bind(null, fileName));
      }
    };

    /**
     * Unzip the contents of a zip file.
     *
     * @param {Array} ArrayBuffer corresponding to the zip file data.
     * @return {Array} array of objects where each object has the properties name: the file
     * name and data: the file's data.
     */
    viewerjs.Viewer.prototype.unzipFileData = function(zData) {
      var zip = jszip(zData);
      var fileDataArr = [];

      for (var name in zip.files) {
        fileDataArr.push({name: name, data: zip.file(name).asArrayBuffer()});
      }
      return fileDataArr;
    };

    /**
     * Static method to determine if a File object is a supported neuroimage type.
     *
     * @param {Object} HTML5 File object
     * @return {String} the type of the image: 'dicom', 'dicomzip', 'vol', 'fibers', 'mesh',
     * 'thumbnail', 'json' or 'unsupported'
     */
    viewerjs.Viewer.imgType = function(file) {
      var ext = {};
      var type;

      // dicom extensions
      ext.DICOM = ['.dcm', '.ima', '.DCM', '.IMA'];
      // zipped dicom extensions
      ext.DICOMZIP = ['.dcm.zip', '.DCM.zip'];
      // volume extensions
      ext.VOL = ['.mgh', '.mgz', '.nrrd', '.nii', '.nii.gz'];
      // fibers extension is .trk
      ext.FIBERS = ['.trk'];
      // geometric model extensions
      ext.MESH = ['.obj', '.vtk', '.stl'];
      // thumbnail extensions
      ext.THUMBNAIL = ['.png', '.gif', '.jpg'];
      // json extensions
      ext.JSON = ['.json'];

      if (viewerjs.strEndsWith(file.name, ext.DICOM)) {
        type = 'dicom';
      } else if (viewerjs.strEndsWith(file.name, ext.DICOMZIP)) {
        type = 'dicomzip';
      } else if (viewerjs.strEndsWith(file.name, ext.VOL)) {
        type = 'vol';
      } else if (viewerjs.strEndsWith(file.name, ext.FIBERS)) {
        type = 'fibers';
      } else if (viewerjs.strEndsWith(file.name, ext.MESH)) {
        type = 'mesh';
      } else if (viewerjs.strEndsWith(file.name, ext.THUMBNAIL)) {
        type = 'thumbnail';
      } else if (viewerjs.strEndsWith(file.name, ext.JSON)) {
        type = 'json';
      } else {
        type = 'unsupported';
      }

      return type;
    };

    /**
     * Static method to parse a dicom file. Raises an exception if the parsing fails.
     *
     * @return {Object} the dicom info object
     */
    viewerjs.Viewer.parseDicom = function(dicomFileData) {

      // Here we use Chafey's dicomParser: https://github.com/chafey/dicomParser.
      // dicomParser requires as input a Uint8Array so we create it here
      var byteArray = new Uint8Array(dicomFileData);
      // Invoke the parseDicom function and get back a DataSet object with the contents
      var dataSet = dicomParser.parseDicom(byteArray);

      // Access any desire property using its tag
      return {
        patientName: dataSet.string('x00100010'),
        patientId: dataSet.string('x00100020'),
        patientBirthDate: dataSet.string('x00100030'),
        patientAge: dataSet.string('x00101010'),
        patientSex: dataSet.string('x00100040'),
        seriesDescription: dataSet.string('x0008103e'),
        manufacturer: dataSet.string('x00080070'),
        studyDate: dataSet.string('x00080020')
      };
    };

    /**
     * Module utility function. Return true if the string str ends with any of the
     * specified suffixes in arrayOfStr otherwise return false.
     *
     * @param {String} input string
     * @param {Array} array of string suffixes
     * @return {boolean}
     */
    viewerjs.strEndsWith = function(str, arrayOfStr) {
      var index;

      for (var i=0; i<arrayOfStr.length; i++) {
        index = str.lastIndexOf(arrayOfStr[i]);
        if ((index !== -1) && ((str.length-index) === arrayOfStr[i].length)) {
          return true;
        }
      }
      return false;
    };

    /**
     * Module utility function. Sort an array of objects with a string property prop.
     * The ordering is based on that property.
     *
     * @param {Array} array of string suffixes
     * @param {String} the objects' ordering property
     * @return {Array} Sorted array
     */
     viewerjs.sortObjArr = function(objArr, prop) {

       return objArr.sort(function(o1, o2) {
         var values = [o1[prop], o2[prop]].sort();

         if (values[0] === values[1]) {
           return 0;
         } else if (values[0] === o1[prop]) {
           return -1;
         } else {
           return 1;
         }
       });
     };

    /**
     * Module utility function. Create a Blob object containing a JPG image from a data URI.
     *
     * @param {String} a data URI such as the one returned by the toDataURL() of
     * a canvas element
     * @return {Object} Blob object containing the JPG image
     */
     viewerjs.dataURItoJPGBlob = function(dataURI) {
       var binary = atob(dataURI.split(',')[1]);
       var array = [];

       for(var i = 0; i < binary.length; i++) {
         array.push(binary.charCodeAt(i));
       }
       return new Blob([new Uint8Array(array)], {type: 'image/jpeg'});
     };

    /**
     * Module utility function. Make an Ajax request to get a Blob from a url.
     *
     * @param {String} a url
     * @param {Function} callback whose argument is the Blob object
     */
     viewerjs.urlToBlob = function(url, callback) {
       var xhr = new XMLHttpRequest();

       xhr.open('GET', url);
       xhr.responseType = 'blob';//force the HTTP response, response-type header to be blob
       xhr.onload = function() {
           callback(xhr.response);//xhr.response is now a blob object
       };
       xhr.send();
     };

    /**
     * Module utility function. Repaint the document
     */
    viewerjs.documentRepaint = function() {
      var ev = document.createEvent('Event');
      ev.initEvent('resize', true, true);
      window.dispatchEvent(ev);
    };

  return viewerjs;
});
