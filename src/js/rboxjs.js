/**
 * This module implements a renderers's container box
 */

// define a new module
define(['utiljs', 'jszip', 'jquery_ui', 'xtk', 'dicomParser'], function(util, jszip) {

  /**
   * Provide a namespace for the renderers box module
   *
   * @namespace
   */
   var rboxjs = rboxjs || {};

   /**
    * Class implementing the renderers' box
    *
    * @constructor
    * @param {String} HTML container's id.
    * @param {Object} optional file manager object to enable reading of files from the cloud or HTML5
    * sandboxed filesystem.
    */
    rboxjs.RenderersBox = function(containerId, fileManager) {

      this.version = 0.0;
      // renderers box's container's ID
      this.contId = containerId;
      // parent container's ID
      this.parentContId = "";
      // jQuery object for the box's div element (box container)
      this.jqRBox = null;
      // list of currently rendered 2D renderer objects
      this.renders2D = [];
      // whether renderers' events are linked
      this.rendersLinked = false;
      // maximum number of renderers
      this.maxNumOfRenders = 4;
      // current number of renderers
      this.numOfRenders = 0;
      // file manager object
      this.fileManager = null;
      if (fileManager) {this.fileManager = fileManager;}
      // scene object
      this.scene = null;
    };

    /**
     * Initialize the renderers box.
     */
     rboxjs.RenderersBox.prototype.init = function() {
       var self = this;
       var pContId;
       var jqRBox;

       // return if renderers box already initialized
       if (this.jqRBox) {
         return;
       }

       // set jQuery obj for the  renderers box
       this.jqRBox = jqRBox = $('#' + this.contId);
       // set parent container's id
       this.parentContId = pContId = jqRBox.parent().attr('id');
       // add the appropriate classes
       jqRBox.addClass("view-renders " + pContId + "-sortable");

       // jQuery UI options object for sortable elems
       // ui-sortable CSS class is by default added to the containing elem
       // an elem being moved is assigned the ui-sortable-helper class
       var sort_opts = {
         cursor: 'move',
         distance: '60', // required moving distance before the displacement is taken into account
         containment: '#' + pContId, // CSS selector within which elem displacement is restricted
         connectWith: '.' + pContId + '-sortable', // CSS selector representing the elems in which we can insert these elems.
         dropOnEmpty: true, // allows depositing items into an empty list

         //event handlers
         helper: function(evt, target) { // visually moving element
           return self.computeMovingHelper(evt, target);
         },

         start: function(evt, ui) {
           self.onStart(evt, ui);
         },

         // beforeStop is called when the placeholder is still in the list
         beforeStop: function(evt, ui) {
           self.onBeforeStop(evt, ui);
         }
      };

      // make the renderers box a jQuery UI's sortable element
      jqRBox.sortable(sort_opts);
    };

    /**
     * This method creates and returns a new visual element that will be displayed instead of a renderer
     * when dragging the renderer out of the renderers box. The element is removed at the end of the move.
     *
     * @param {Object} jQuery UI event object.
     * @param {Object} jQuery UI target object.
     */
     rboxjs.RenderersBox.prototype.computeMovingHelper = function(evt, target) {

       console.log('computeMovingHelper not overwritten!');
       console.log('event obj: ', evt);
       console.log('target obj: ', target);

       // if not overwritten then the visually moving helper is a clone of the target element
       return target.clone();
     };

    /**
     * This method is called at the beginning of moving a renderer out of the renderers box.
     *
     * @param {Object} jQuery UI event object.
     * @param {Object} jQuery UI ui object.
     */
     rboxjs.RenderersBox.prototype.onStart = function(evt, ui) {

       console.log('onStart not overwritten!');
       console.log('event obj: ', evt);
       console.log('ui obj: ', ui);
     };

    /**
     * This method is called just before dropping a moving helper visual element on a complementary
     * jQuery UI's sortable element.
     *
     * @param {Object} jQuery UI event object.
     * @param {Object} jQuery UI ui object.
     */
     rboxjs.RenderersBox.prototype.onBeforeStop = function(evt, ui) {

       console.log('onBefore not overwritten!');
       console.log('event obj: ', evt);
       console.log('ui obj: ', ui);
     };

   /**
    * This method is called when any of the contained renderers changes status.
    *
    * @param {Object} event object.
    */
    rboxjs.RenderersBox.prototype.onRenderChange = function(evt) {

      console.log('onRenderChange not overwritten!');
      console.log('event obj: ', evt);
    };

   /**
    * Set a complementary jQuery UI sortable element which the moving helper can be visually appended to.
    *
    * @param {Object} jQery UI event object.
    * @param {Object} jQery UI ui object.
    */
    rboxjs.RenderersBox.prototype.setComplementarySortableElem = function(csId) {

      if (this.parentContId === $('#' + csId).parent().attr('id')) {

        // the moving helper element can be appended to this element
        this.jqRBox.sortable( "option", "appendTo", '#' + csId);
      } else {
        console.error("The complementary jQuery UI sortable element must have the same parent container as this renderers box");
      }
    };

    /**
     * Create an xtk volume object.
     *
     * @param {Object} image file object with the following properties:
     *  -id: Integer, the object's id
     *  -baseUrl: String ‘directory/containing/the/files’
     *  -imgType: String neuroimage type. Any of the possible values returned by rboxjs.RenderersBox.imgType
     *  -files: Array of HTML5 File objects (it contains a single file for imgType different from 'dicom')
     *         DICOM files with the same base url/path are assumed to belong to the same volume
     *  -json: HTML5 File object (an optional json file with the mri info for imgType different from 'dicom')
     */
     rboxjs.RenderersBox.prototype.createVolume = function(imgFileObj) {
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
     * Get XTK volume properties for the passed orientation.
     *
     * @param {String} X, Y or Z orientation.
     * @return {Object} the volume properties.
     */
     rboxjs.RenderersBox.prototype.getVolProps = function(orientation) {
       var volProps = {};

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

       return volProps;
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
     rboxjs.RenderersBox.prototype.create2DRender = function(containerId, orientation) {
      var render;

      // create xtk object
      render = new X.renderer2D();
      render.container = containerId;
      render.bgColor = [0.2, 0.2, 0.2];
      render.orientation = orientation;
      render.init();
      return render;
    };

    /**
     * Create and add a 2D renderer with a loaded volume to the renderers' container.
     *
     * @param {Oject} Image file object as in rboxjs.RenderersBox.prototype.createVolume.
     * @param {String} X, Y or Z orientation.
     * @param {Function} optional callback whose argument is the 2D renderer object if successfuly
     * added or null otherwise.
     */
     rboxjs.RenderersBox.prototype.add2DRender = function(imgFileObj, orientation, callback) {
      var render, vol, volProps;
      var self = this;

      // the renderer's id is related to the imgFileObj's id
      var containerId = this.contId + "_render2D" + imgFileObj.id;
      if ($('#' + containerId).length) {
        // renderer already added
        if (callback) {
          callback(self.renders2D.filter(function(rendr) {return rendr.container.id === containerId;})[0]);
        }
        return;
      }

      if (this.numOfRenders === this.maxNumOfRenders) {
        // already reached maximum number of renderers so this renderer can not be added
        if (callback) {callback(null);}
        return;
      }

      // append renderer div to the renderers' container
      this.jqRBox.append(
        '<div id="' + containerId + '" class="view-render">' +
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
      render = this.create2DRender(containerId, orientation);
      volProps = this.getVolProps(orientation);

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

        self.onRenderChange(evt);
      };

      this.onRender2DZoom = function(evt) {
        self.onRenderChange(evt);
      };

      this.onRender2DPan = function(evt) {
        self.onRenderChange(evt);
      };

      this.onRender2DRotate = function(evt) {
        self.onRenderChange(evt);
      };

      this.onRender2DFlipColumns = function(evt) {
        // press W to trigger this event
        render.flipColumns = !render.flipColumns;
        self.onRenderChange(evt);
      };

      this.onRender2DFlipRows = function(evt) {
        // press Q to trigger this event
        render.flipRows = !render.flipRows;
        self.onRenderChange(evt);
      };

      this.onRender2DPoint = function(evt) {
        self.onRenderChange(evt);
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
          var jqR = $('#' + containerId);
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
          $('.view-render-info-bottomleft', $('#' + containerId)).html(
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
                fDataArr = util.sortObjArr(fDataArr, 'name');

                filedata = [];
                var urls = [];
                for (i=0; i<fDataArr.length; i++) {
                  filedata.push(fDataArr[i].data);
                  urls.push(imgFileObj.baseUrl + fDataArr[i].name);
                }
                vol.file = urls;
              }

              try {
                imgFileObj.dicomInfo = rboxjs.RenderersBox.parseDicom(filedata[0]);
              } catch(err) {
                console.log('Could not parse dicom ' + imgFileObj.baseUrl + ' Error - ' + err);
              }
            }

            vol.filedata = filedata;
            render.add(vol);
            // start the rendering
            render.render();
            util.documentRepaint();
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
     * @param {Function} optional callback.
     */
     rboxjs.RenderersBox.prototype.remove2DRender = function(containerId, callback) {

      // find and destroy xtk objects and remove the renderer's div from the UI
      for (var i=0; i<this.renders2D.length; i++) {

        if ($(this.renders2D[i].container).attr('id') === containerId) {
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
          $('#' + containerId).remove();
          --this.numOfRenders;
          this.positionRenders();
          util.documentRepaint();
          if (callback) {callback();}
          break;
        }
      }
    };

    /**
     * Rearrange renderers in the UI layout.
     */
     rboxjs.RenderersBox.prototype.positionRenders = function() {
      // sort by id
      var jqRenders = util.sortObjArr($('div.view-render', this.jqRBox), 'id');

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
     * Read a local or remote file.
     *
     * @param {Object} HTML5 file object or an object containing properties:
     *  -remote: a boolean indicating whether the file has not been read locally (with a filepicker)
     *  -url the file's url
     *  -clouId: the id of the file in a cloud storage system if stored in the cloud
     * @param {String} reading method.
     * @param {Function} callback whose argument is the file data.
     */
     rboxjs.RenderersBox.prototype.readFile = function(file, readingMethod, callback) {
      var reader = new FileReader();
      var self = this;

      reader.onload = function() {
        callback(reader.result);
      };

      if (file.remote) {
        // the file is in a remote storage
        if (file.cloudId) {
          // the file is in the cloud
          if (self.fileManager) {
            // reading files from the cloud was enabled
            self.fileManager.getFileBlob(file.cloudId, function(blob) {
              reader[readingMethod](blob);
            });
          } else {
            console.error('No file manager found. Reading files from cloud was not enabled');
          }
        } else {
          // the file is in a remote backend
          util.urlToBlob(file.url, function(blob) {
            reader[readingMethod](blob);
          });
        }
      } else {
        // read the file locally
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
     rboxjs.RenderersBox.prototype.zipFiles = function(fileArr, callback) {
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
     rboxjs.RenderersBox.prototype.unzipFileData = function(zData) {
      var zip = jszip(zData);
      var fileDataArr = [];

      for (var name in zip.files) {
        fileDataArr.push({name: name, data: zip.file(name).asArrayBuffer()});
      }
      return fileDataArr;
    };

    /**
     * Destroy all objects and remove html interface
     */
     rboxjs.RenderersBox.prototype.destroy = function() {

      // destroy XTK renderers
      for (var i=0; i<this.renders2D.length; i++) {
        this.remove2DRender($(this.renders2D[i].container).attr("id"));
      }

      // remove html
      this.jqRBox.empty();
      this.jqRBox = null;
    };

    /**
     * Static method to determine if a File object is a supported neuroimage type.
     *
     * @param {Object} HTML5 File object
     * @return {String} the type of the image: 'dicom', 'dicomzip', 'vol', 'fibers', 'mesh',
     * 'thumbnail', 'json' or 'unsupported'
     */
     rboxjs.RenderersBox.imgType = function(file) {
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

      if (util.strEndsWith(file.name, ext.DICOM)) {
        type = 'dicom';
      } else if (util.strEndsWith(file.name, ext.DICOMZIP)) {
        type = 'dicomzip';
      } else if (util.strEndsWith(file.name, ext.VOL)) {
        type = 'vol';
      } else if (util.strEndsWith(file.name, ext.FIBERS)) {
        type = 'fibers';
      } else if (util.strEndsWith(file.name, ext.MESH)) {
        type = 'mesh';
      } else if (util.strEndsWith(file.name, ext.THUMBNAIL)) {
        type = 'thumbnail';
      } else if (util.strEndsWith(file.name, ext.JSON)) {
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
     rboxjs.RenderersBox.parseDicom = function(dicomFileData) {

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


    return rboxjs;
  });
