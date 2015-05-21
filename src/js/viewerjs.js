/**
 * This module takes care of all image visualization, user interface and collaboration
 * through the collaboration module.
 */

// define a new module
define(['gcjs', 'jquery_ui', 'dicomParser', 'xtk'], function(gcjs) {

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
    * @param {String} Optional client ID from the Google's developer console to enable
    * realtime collaboration.
    */
    viewerjs.Viewer = function(containerID, clientId) {

      this.version = 0.0;
      // viewer container's ID
      this.wholeContID = containerID;
      // tool bar container's ID
      this.toolbarContID = this.wholeContID + '_toolbar';
      // thumbnail container's ID
      this.thumbnailbarContID = this.wholeContID + '_thumbnailbar';
      // renderers container's ID
      this.rendersContID =  this.wholeContID + '_renders';
      // 2D renderer objects
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
      //  -files: Array of HTML5 File objects (it contains a single file for imgType different from 'dicom')
      //   DICOM files with the same base url/path are assumed to belong to the same volume
      //  -thumbnail: HTML5 File object (for a thumbnail image)
      //  -json: HTML5 File object (an optional json file with the mri info for imgType different from 'dicom')
      this.imgFileArr = [];

      // collaboration object
      this.collab = null;
      if (clientId) {
        this.collab = new gcjs.GDriveCollab(clientId);
      }
      // scene object
      this.scene = null;

    };

    /**
     * Build viewer's main data structure and initiliaze the UI's html.
     *
     * @param {Array} array of file objects. Each object contains the following properties:
     * -url: String representing the file url
     * -file: HTML5 File object (optional but neccesary when the files are gotten through a
     *        local filepicker or dropzone)

     */
    viewerjs.Viewer.prototype.init = function(fObjArr) {
      var thumbnails = {}; // associative array of thumbnail image files
      var jsons = {}; // associative array of json files
      var dicoms = {}; // associative array of arrays with ordered DICOM files
      var nonDcmData = []; // array of non-DICOM data
      var self = this;

      // function to build the image file array
      function buildImgFileArr() {
        var path, name, i, j;

        // push ordered DICOMs into self.imgFileArr
        for (var baseUrl in dicoms) {
          self.imgFileArr.push({
          'baseUrl': baseUrl,
          'imgType': 'dicom',
          'files': dicoms[baseUrl].sort(function(f1, f2) {
            var fnames = [f1.name, f2.name].sort();

            if (fnames[0] === fnames[1]) {
              return 0;
            } else if (fnames[0] === f1.name) {
              return -1;
            } else {
              return 1;
            }
          })});
        }
        // push non-DICOM data into self.imgFileArr
        for (i=0; i<nonDcmData.length; i++) {
          self.imgFileArr.push(nonDcmData[i]);
        }
        // assign an id to each array elem
        for (i=0; i<self.imgFileArr.length; i++) {
          self.imgFileArr[i].id = i;
        }
        // add thumbnail images
        for (var th in thumbnails) {
          // Search for a neuroimage file with the same name as the current thumbnail
          for (i=0; i<self.imgFileArr.length; i++) {
            j = 0;
            do {
              path = self.imgFileArr[i].baseUrl + self.imgFileArr[i].files[j].name;
              name = path.substring(0, path.lastIndexOf('.'));
            } while ((++j<self.imgFileArr[i].files.length)  && (th!==name));
            if (th === name) {
              self.imgFileArr[i].thumbnail = thumbnails[th];
              break;
            }
          }
        }
        // add json files
        for (var jsn in jsons) {
          // Search for a neuroimage file with the same name as the current json
          for (i=0; i<self.imgFileArr.length; i++) {
            j = 0;
            do {
              path = self.imgFileArr[i].baseUrl + self.imgFileArr[i].files[j].name;
              name = path.substring(0, path.lastIndexOf('.'));
            } while ((++j<self.imgFileArr[i].files.length)  && (jsn!==name));
            if (jsn === name) {
              self.imgFileArr[i].json = jsons[jsn];
              break;
            }
          }
        }

      }

      // function to add a file object into internal data structures
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
       }

       imgType = viewerjs.Viewer.imgType(file);

       if (imgType === 'dicom') {
         if (!dicoms[baseUrl]) {
           dicoms[baseUrl] = [];
         }
         dicoms[baseUrl].push(file); // all dicoms with the same base url belong to the same volume
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
         // push fibers, meshes and volumes into nonDcmData
         nonDcmData.push({
           'baseUrl': baseUrl,
           'imgType': imgType,
           'files': [file]
         });
       }

     }

      // insert initial html
      this._initInterface();
      // add files
      for (var i=0; i<fObjArr.length; i++) {
        addFile(fObjArr[i]);
      }
      // build viewer's main data structure
      buildImgFileArr();
      // load and render the first volume
      for (i=0; i<this.imgFileArr.length; i++) {
        if (this.imgFileArr[i].imgType==='vol' || this.imgFileArr[i].imgType==='dicom') {
          this.add2DRender(this.imgFileArr[i], 'Z');
          break;
        }
      }

      // temporal code
      this.scene = {data: 0};

    };

    /**
     * Append initial html interface to the viewer container.
     */
    viewerjs.Viewer.prototype._initInterface = function() {
      var self = this;

      // Initially the interface only contains the renderers' container which in turn contains a
      // single renderer that loads and displays the first volume in this.imgFileArr

      $('#' + this.wholeContID).css({
        "position": "relative",
        "margin": 0,
        "-webkit-box-sizing": "border-box",
        "-moz-box-sizing": "border-box",
        "box-sizing": "border-box"
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
          var thWidth =  $('.view-thumbnail').css("width");
          var thHeight = $('.view-thumbnail').css("height");
          var renderId = target.attr("id");
          var thId = renderId.replace(self.rendersContID + "_render2D", self.thumbnailbarContID + "_th");

          // the moving helper is a clone of the corresponding thumbnail
          return $('#' + thId).clone().css({
            display:"block",
            width: thWidth,
            height: thHeight });
        },

        //event handlers
        start: function() {
          // thumbnails' scroll bar has to be removed to make the moving helper visible
          $('#' + self.thumbnailbarContID).css({ overflow: "visible" });
        },

        beforeStop: function(evt, ui) {
          var renderId, thId;

          if (ui.placeholder.parent().attr("id") === self.thumbnailbarContID) {
            $(this).sortable("cancel");
            renderId = ui.item.attr("id");
            thId = renderId.replace(self.rendersContID + "_render2D", self.thumbnailbarContID + "_th");
            // display the dropped renderer's thumbnail
            $('#' + thId).css({ display:"block" });
            self.remove2DRender(renderId);
          }
          // restore thumbnails' scroll bar
          $('#' + self.thumbnailbarContID).css({ overflow: "auto" });
        }
      };

      // make the renderers container sortable
      $('#' + this.rendersContID).sortable(sort_opts);

    };

    /**
     * Create and add a 2D renderer with a loaded volume to the UI.
     *
     * @param {Oject} Image file object.
     * @param {String} X, Y or Z orientation.
     */
    viewerjs.Viewer.prototype.add2DRender = function(imgFileObj, orientation) {
      var render, vol, containerID;
      var self = this;

      // append renderer div to the renderers container
      // the renderer's id is related to the imgFileObj's id
      containerID = this.rendersContID + "_render2D" + imgFileObj.id;
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
      this.positionRenders();

      //
      // create xtk objects
      //
      render = this.create2DRender(containerID, orientation);
      // renderer's event handlers
      this.onRender2DScroll = function(evt) {
        var i;

        for (i=0; i<self.renders2D.length; i++) {
          if (self.renders2D[i].interactor === this) {
            // update slice number on the GUI
            $('.view-render-info-bottomleft', $(self.renders2D[i].container)).html(
              'slice: ' + (self.renders2D[i].volume.indexZ + 1) + '/' + self.renders2D[i].volume.range[2]);
          }
        }
        if (self.rendersLinked && !evt.detail) {
          // scroll event triggered by the user
          evt.detail = true;
          for (i=0; i<self.renders2D.length; i++) {
            if (self.renders2D[i].interactor !== evt.target) {
              // trigger the scroll event programatically on other renderers
              self.renders2D[i].interactor.dispatchEvent(evt);
            }
          }
        }
      };
      // bind onRender2DScroll method with the renderer's interactor
      render.interactor.addEventListener(X.event.events.SCROLL, this.onRender2DScroll);

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
            'slice: ' + (vol.indexZ + 1) + '/' + vol.range[2]);
        }

        // define function to read the json file
        function readJson(file, callback) {
          var reader = new FileReader();

          reader.onload = function() {
            callback(JSON.parse(reader.result));
          };

          if (file.remote) {
            viewerjs.urlToBlob(file.url, function(blob) {
              reader.readAsText(blob);
            });
          } else {
            reader.readAsText(file);
          }
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
            'slice: ' + (vol.indexZ + 1) + '/' + vol.range[2]);
        }
      };

      // create xtk volume and link it to its render
      vol = this.createVolume(imgFileObj);
      render.volume = vol;

      // add xtk 2D renderer to the list of current UI renders
      this.renders2D.push(render);

      // function to read an MRI file into filedata array
      var filedata = [];
      var numFiles = 0;
      function readMriFile(file, pos) {
        var reader = new FileReader();

        reader.onload = function() {
          filedata[pos] = reader.result;
          ++numFiles;

          if (numFiles===imgFileObj.files.length) {
            if (imgFileObj.imgType === 'dicom') {
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
        };

        if (file.remote) {
          viewerjs.urlToBlob(file.url, function(blob) {
            reader.readAsArrayBuffer(blob);
          });
        } else {
          reader.readAsArrayBuffer(file);
        }
      }

      // read all neuroimage files in imgFileObj.files
      for (var i=0; i<imgFileObj.files.length; i++) {
        readMriFile(imgFileObj.files[i], i);
      }

    };

    /**
     * Remove 2D renderer from the UI.
     *
     * @param {String} renderer's container.
     */
    viewerjs.Viewer.prototype.remove2DRender = function(containerID) {

      // find and destroy xtk objects and remove the renderer's div from the UI
      for (var i=0; i<this.renders2D.length; i++) {
        if ($(this.renders2D[i].container).attr("id") === containerID) {
          this.renders2D[i].remove(this.renders2D[i].volume);
          this.renders2D[i].volume.destroy();
          this.renders2D[i].interactor.removeEventListener(X.event.events.SCROLL, this.onRender2DScroll);
          this.renders2D[i].destroy();
          this.renders2D.splice(i, 1);
          $('#' + containerID).remove();
          --this.numOfRenders;
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
      var vol;

      for (var i=0; i<imgFileObj.files.length; i++) {
        fileNames[i] = imgFileObj.files[i].name;
      }
      // create xtk object
      vol = new X.volume();
      vol.reslicing = 'false';
      vol.file = fileNames.sort().map(function(str) {
        return imgFileObj.baseUrl + str;});
      return vol;
    };

    /**
     * Rearrange renderers in the UI layout.
     */
    viewerjs.Viewer.prototype.positionRenders = function() {
      var jqRenders = $('div.view-render', $('#' + this.rendersContID));

      switch(this.numOfRenders) {
        case 1:
          jqRenders.css({
            width: "100%",
            height: "100%",
            top: 0,
            left: 0
          });
        break;

        case 2:
          jqRenders.css({
            width: "50%",
            height: "100%",
            top: 0,
            left:0
          });
          jqRenders[1].style.left = "50%";
        break;

        case 3:
          jqRenders.css({
            width: "50%",
            height: "50%",
          });
          jqRenders[0].style.top = 0;
          jqRenders[0].style.left = 0;
          jqRenders[1].style.top = 0;
          jqRenders[1].style.left = "50%";
          jqRenders[2].style.top = "50%";
          jqRenders[2].style.left = 0;
          jqRenders[2].style.width = "100%";
        break;

        case 4:
          jqRenders.css({
            width: "50%",
            height: "50%",
          });
          jqRenders[0].style.top = 0;
          jqRenders[0].style.left = 0;
          jqRenders[1].style.top = 0;
          jqRenders[1].style.left = "50%";
          jqRenders[2].style.top = "50%";
          jqRenders[2].style.left = 0;
          jqRenders[3].style.top = "50%";
          jqRenders[3].style.left = "50%";
        break;
      }
    };

    /**
     * Create and add toolbar to the viewer container.
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
      $('#' + this.toolbarContID + '_buttonauth').css({display: "none" });

      // make space for the toolbar
      var jqToolCont = $('#' + this.toolbarContID);
      var rendersTopEdge = parseInt(jqToolCont.css("top")) + parseInt(jqToolCont.css("height")) + 5;
      $('#' + this.rendersContID).css({ height: "calc(100% - " + rendersTopEdge + "px)" });
      if ($('#' + this.thumbnailbarContID).length) {
        // there is a thumbnail bar so make space for it
        var jqThCont = $('#' + this.thumbnailbarContID);
        var toolLeftEdge = parseInt(jqThCont.css("left")) + parseInt(jqThCont.css("width")) + 5;
        jqToolCont.css({ width: "calc(100% - " + toolLeftEdge + "px)" });
      }

      //
      // event handlers
      //
      $('#' + this.toolbarContID + '_buttonlink').click(function() {
        if (self.rendersLinked) {
          self.rendersLinked = false;
          $(this).text("Link views");
          $(this).attr("title", "Link views");
        } else {
          self.rendersLinked = true;
          $(this).text("Unlink views");
          $(this).attr("title", "Unlink views");
        }
      });

      $('#' + this.toolbarContID + '_buttoncollab').click(function() {
        if (self.collaborationIsOn) {
          self.leaveCollaboration();
        } else {
          self.startCollaboration();
        }
      });

    };

    /**
     * Create and add thumbnail bar to the viewer container.
     */
    viewerjs.Viewer.prototype.addThumbnailBar = function() {
      var self = this;

      if (this.imgFileArr.length<2){
        return; // a single (or none) file doesn't need a thumbnail bar
      }
      if ($('#' + this.thumbnailbarContID).length){
        return; // thumbnail bar already exists
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
              self.add2DRender(self.getImgFileObject(id), 'Z');
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
      var rendersLeftEdge = parseInt(jqThBarCont.css("left")) + parseInt(jqThBarCont.css("width")) + 5;
      $('#' + this.rendersContID).css({ width: "calc(100% - " + rendersLeftEdge + "px)" });
      if ($('#' + this.toolbarContID).length) {
        // there is a toolbar
        $('#' + this.toolbarContID).css({ width: "calc(100% - " + rendersLeftEdge + "px)" });
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
        function readThumbnailUrl() {
          var reader = new FileReader();

          reader.onload = function() {
            imgJq.attr('src', reader.result);
            // if there is a corresponding renderer window already in the UI then hide this thumbnail
            if ($('#' + self.rendersContID + '_render2D' + id).length) {
              thContJq.css({ display:"none" });
            }
          };

          if (imgFileObj.thumbnail.remote) {
            viewerjs.urlToBlob(imgFileObj.thumbnail.url, function(blob) {
              reader.readAsDataURL(blob);
            });
          } else {
            reader.readAsDataURL(imgFileObj.thumbnail);
          }
        }

        // internal function to create and read the thumbnails' url so it can be assigned to the src of <img>
        function createAndReadThumbnailUrl() {
          var filedata = [];
          var numFiles = 0;
          var vol = self.createVolume(imgFileObj);
          var render;
          var tempRenderContId = thContJq.attr('id') + '_temp';
          var imgWidth = imgJq.css("width");
          var imgHeight = imgJq.css("height");

          // hide the <img> and prepend a div for a renderer canvas with the same size as the hidden <img>
          imgJq.css({ display:"none" });
          thContJq.prepend('<div id="' + tempRenderContId + '"></div>');
          $('#' + tempRenderContId).css({ width: imgWidth, height: imgHeight });
          render = self.create2DRender(tempRenderContId, 'Z');

          render.afterRender = function() {
            var canvas = $('#' + tempRenderContId + ' > canvas')[0];
            var img = imgJq[0];
            var reader = new FileReader();

            reader.onload = function() {
              img.src = reader.result;
              render.remove(vol);
              vol.destroy();
              $('#' + tempRenderContId).remove();
              render.destroy();
              // restore the hidden <img>
              imgJq.css({ display:"block" });
              // if there is a corresponding renderer window already in the UI then hide this thumbnail
              if ($('#' + self.rendersContID + '_render2D' + id).length) {
                thContJq.css({ display:"none" });
              }
            };

            reader.readAsDataURL(viewerjs.dataURItoJPGBlob(canvas.toDataURL('image/jpeg')));
          };

          function readFile(file, pos) {
            var reader = new FileReader();

            reader.onload = function() {
              filedata[pos] = reader.result;
              ++numFiles;
              if (numFiles===imgFileObj.files.length) {
                // all files have been read
                if (imgFileObj.imgType === 'dicom') {
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
            };

            if (file.remote) {
              viewerjs.urlToBlob(file.url, function(blob) {
                reader.readAsArrayBuffer(blob);
              });
            } else {
              reader.readAsArrayBuffer(file);
            }
          }

          // read all files belonging to the volume
          for (var i=0; i<imgFileObj.files.length; i++) {
            readFile(imgFileObj.files[i], i);
          }
        }

        if (imgFileObj.thumbnail) {
          readThumbnailUrl();
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
     * Start the realtime collaboration.
     *
     * @param {String} Client ID from the Google's developer console.
     * @param {String} Collaboration room id. This id must be passed if there is no data
     * in the viewer (current viewer is not the collaboration owner) otherwise it is
     * ignored if passed and a new room id is created to share these data (current viewer
     * becomes a collaboration owner).
     */
    viewerjs.Viewer.prototype.startCollaboration = function(roomId) {
      var self = this;
      var collabButton = document.getElementById(this.toolbarContID + '_buttoncollab');
      var authButton = document.getElementById(this.toolbarContID + '_buttonauth');

      // function to start collaboration
      var startCollaboration = function() {
        if (self.scene) {
          self.collab.startRealtimeCollaboration("", self.scene);
        } else {
          self.collab.startRealtimeCollaboration(roomId);
        }
      };

      this.collab.authorizeAndLoadApi(true, function(granted) {
        if (granted) {
          // realtime API ready.
          startCollaboration();
        } else {
          // show the auth button to start the authorization flow
          collabButton.style.display = 'none';
          authButton.style.display = '';

          authButton.onclick = function() {
            self.collab.authorizeAndLoadApi(false, function(granted) {
              if (granted) {
                // realtime API ready.
                startCollaboration();
              }
            });
          };
        }
      });

      // This method is called when the collaboration has successfully started and is ready
      this.collab.onConnect = function(fileId) {
        var roomIdLabel = document.getElementById(self.toolbarContID + '_labelcollab');

        self.collaborationIsOn = true;
        authButton.style.display = 'none';
        collabButton.style.display = '';
        collabButton.innerHTML = "End collab";
        collabButton.title = "End collaboration";
        roomIdLabel.innerHTML = fileId;
        console.log('collaborationIsOn = ', self.collaborationIsOn);
      };
    };

    /**
     * Leave the realtime collaboration.
     */
    viewerjs.Viewer.prototype.leaveCollaboration = function() {
      var collabButton = document.getElementById(this.toolbarContID + '_buttoncollab');
      var roomIdLabel = document.getElementById(this.toolbarContID + '_labelcollab');

      this.collab.leaveRealtimeCollaboration();
      this.collaborationIsOn = false;
      collabButton.innerHTML = "Start collab";
      collabButton.title = "Start collaboration";
      roomIdLabel.innerHTML = "";
      console.log('collaborationIsOn = ', this.collaborationIsOn);
    };

    /**
     * Static method to determine if a File object is a supported neuroimage type.
     * Return the type of the image: 'dicom', 'vol', 'fibers', 'mesh', 'thumbnail'
     * or 'unsupported'
     *
     * @param {Object} HTML5 File object
     */
    viewerjs.Viewer.imgType = function(file) {
      var ext = {};
      var type;

      // dicom extensions
      ext.DICOM = ['.dcm', '.ima', '.DCM', '.IMA'];
      // volume extensions
      ext.VOL = ['.mgh', '.mgz', '.nrrd', '.nii', '.nii.gz'];
      // fibers extension is .trk
      ext.FIBERS = ['.trk'];
      // geometric model extensions
      ext.MESH = ['obj', 'vtk', 'stl'];
      // thumbnail extensions
      ext.THUMBNAIL = ['png', 'gif', 'jpg'];
      // json extensions
      ext.JSON = ['json'];

      if (viewerjs.strEndsWith(file.name, ext.DICOM)) {
        type = 'dicom';
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
     * Static method to parse a dicom file. Raises an exception if the parsing fails
     *
     * @param {Object} ArrayBuffer object containing the dicom data
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
     * specified suffixes in arrayOfStr otherwise return false
     *
     * @param {String} input string
     * @param {Array} array of string suffixes
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
     * Module utility function. Create and return a Blob object conytaining a JPG image
     *
     * @param {String} a data URI such as the one returned by the toDataURL() of
     * a canvas element
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

       xhr.open("GET", url);
       xhr.responseType = "blob";//force the HTTP response, response-type header to be blob
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
