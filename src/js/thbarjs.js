/**
 * This module implements a thumbnail bar
 */

// define a new module
define(['utiljs', 'jquery_ui'], function(util) {

  /**
   * Provide a namespace for the thumbnail bar module
   *
   * @namespace
   */
   var thbarjs = thbarjs || {};

   /**
    * Class implementing the thumbnail bar
    *
    * @constructor
    * @param {String} HTML container's id.
    * @param {Object} associated renderers box object.
    */
    thbarjs.ThumbnailBar = function(containerId, rBox) {

      this.version = 0.0;
      // thumbnail container's ID
      this.contId = containerId;
      // parent container's ID
      this.parentContId = "";
      // jQuery object for the bar's div element (thumbnail bar container)
      this.jqThBar = null;
      // number of thumbnails in the thumbnail bar
      this.numThumbnails = 0;
      // number of currently loaded thumbnails
      this.numOfLoadedThumbnails = 0;
      // renderers box object
      this.rBox = rBox;
      // scene object
      this.scene = null;
    };

    /**
     * Initialize the thumbnail bar.
     *
     * @param {Array} array of image file objects. Each object contains the following properties:
     *  -id: Integer, the object's id
     *  -baseUrl: String ‘directory/containing/the/files’
     *  -imgType: String neuroimage type. Any of the possible values returned by rboxjs.RenderersBox.imgType
     *  -files: Array of HTML5 File objects (it contains a single file for imgType different from 'dicom')
     *         DICOM files with the same base url/path are assumed to belong to the same volume
     *  -thumbnail: HTML5 or custom File object (optional jpg file for a thumbnail image)
     * @param {Function} optional callback to be called when the thumbnail bar is ready
     */
     thbarjs.ThumbnailBar.prototype.init = function(imgFileArr, callback) {
       var self = this;
       var pContId;
       var jqThBar;

       // return if thumbnail bar already initialized
       if (this.jqThBar) {
         if (callback) {callback();}
         return;
       }

       // set jQuery obj for the thumbnail bar
       this.jqThBar = jqThBar = $('#' + this.contId);

       // set parent container's id
       this.parentContId = pContId = jqThBar.parent().attr('id');

       // add the appropriate classes
       jqThBar.addClass("view-thumbnailbar " + pContId + "-sortable");

       // jQuery UI options object for sortable elems
       // ui-sortable CSS class is by default added to the containing elem
       // an elem being moved is assigned the ui-sortable-helper class
       var sort_opts = {
         cursor: 'move',
         containment: '#' + pContId, // CSS selector within which elem displacement is restricted
         helper: 'clone', // visually moving element is a clone of the corresponding thumbnail
         connectWith: '.' + pContId + '-sortable', // CSS selector representing the elems in which we can insert these elems.
         dropOnEmpty: true, // allows depositing items into an empty list

         //event handlers
         // beforeStop is called when the placeholder is still in the list
         beforeStop: function(evt, ui) {
           self.onBeforeStop(evt, ui);
         }
      };

      // make the thumnail bar a jQuery UI's sortable element
      jqThBar.sortable(sort_opts);

      var checkIfThumbnailBarIsReady =  function() {
        if (++self.numOfLoadedThumbnails === self.numThumbnails) {
          // all thumbnails loaded
          if (callback) {callback();}
        }
      };

      // load thumbnail images and create their UIs when ready
      this.numThumbnails = imgFileArr.length;
      for (var i=0; i<this.numThumbnails; i++) {
        this.loadThumbnail(imgFileArr[i], checkIfThumbnailBarIsReady);
      }
    };

    /**
    * This method is called just before dropping a moving thumbnail's visual element on a complementary
    * jQuery UI's sortable element.
     *
     * @param {Object} jQuery UI event object.
     * @param {Object} jQuery UI ui object.
     */
     thbarjs.ThumbnailBar.prototype.onBeforeStop = function(evt, ui) {

       console.log('onBeforeStop not overwritten!');
       console.log('event obj: ', evt);
       console.log('ui obj: ', ui);
     };

   /**
    * Set a complementary jQuery UI sortable element which the moving helper can be visually appended to.
    *
    * @param {Object} jQery UI event object.
    * @param {Object} jQery UI ui object.
    */
    thbarjs.ThumbnailBar.prototype.setComplementarySortableElem = function(csId) {

      if (this.parentContId === $('#' + csId).parent().attr('id')) {

        // the moving helper element can be appended to this element
        this.jqThBar.sortable( "option", "appendTo", '#' + csId);
      } else {
        console.error("The complementary jQuery UI sortable element must have the same parent container as this thumbnail bar");
      }
    };

    /**
     * Return a thumbnail's container DOM id.
     *
     * @param {Number} thumbnail's integer id.
     * @return {String} the thumbnail's container DOM id.
     */
     thbarjs.ThumbnailBar.prototype.getThumbnailContId = function(thumbnailId) {

       // the thumbnail's container DOM id is related to the thumbnail's integer id
       return this.contId + "_th" + thumbnailId;
    };

    /**
     * Returns a thumbnail's integer id.
     *
     * @param {String} thumbnail's container DOM id.
     * @return {Number} thumbnail's integer id.
     */
     thbarjs.ThumbnailBar.prototype.getThumbnailId = function(thumbnailContId) {

       // the thumbnail's integer id is related to the thumbnail's container DOM id
       return  parseInt(thumbnailContId.replace(this.contId + "_th", ""));
    };

    /**
     * Load the thumbnail corresponding to the imgFileObj argument. If there is a thumbnail
     * property in the imgFileObj then load it otherwise automatically create the thumbnail
     * from a renderer's canvas object
     *
     * @param {Oject} Image file object.
     * @param {Function} optional callback to be called when the thumbnail has been loaded
     */
     thbarjs.ThumbnailBar.prototype.loadThumbnail = function(imgFileObj, callback) {
       var fname, info, title, jqTh, jqImg;
       var id = imgFileObj.id;
       var jqThBar = this.jqThBar;
       var rBox = this.rBox;

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
       jqThBar.append(
         '<div id="' + this.getThumbnailContId(id) + '" class="view-thumbnail">' +
           '<img class="view-thumbnail-img" title="' + title + '">' +
           '<div class="view-thumbnail-info">' + info + '</div>' +
         '</div>'
       );
       jqTh = $('#' + this.getThumbnailContId(id));
       jqImg = $('.view-thumbnail-img', jqTh);

       // internal function to read the thumbnail's url so it can be assigned to the src of <img>
       function readThumbnailUrl(thumbnail) {
         rBox.readFile(thumbnail, 'readAsDataURL', function(data) {
           jqImg.attr('src', data);

           if (callback) {callback();}
         });
       }

       // internal function to create and read the thumbnails' url so it can be assigned to the src of <img>
       function createAndReadThumbnailUrl() {
         var filedata = [];
         var numFiles = 0;
         var vol = rBox.createVolume(imgFileObj);
         var render;
         var tempRenderContId = jqTh.attr('id') + '_temp';
         var imgWidth = jqImg.css('width');
         var imgHeight = jqImg.css('height');

         // hide the <img> and prepend a div for a renderer canvas with the same size as the hidden <img>
         jqImg.css({ display:'none' });
         jqTh.prepend('<div id="' + tempRenderContId + '"></div>');
         $('#' + tempRenderContId).css({ width: imgWidth, height: imgHeight });
         render = rBox.create2DRender(tempRenderContId, 'Z');

         render.afterRender = function() {
           var canvas = $('#' + tempRenderContId + ' > canvas')[0];

           rBox.readFile(util.dataURItoJPGBlob(canvas.toDataURL('image/jpeg')), 'readAsDataURL', function(data) {
             jqImg.attr('src', data);
             render.remove(vol);
             vol.destroy();
             $('#' + tempRenderContId).remove();
             render.destroy();
             // restore the hidden <img>
             jqImg.css({ display:'block' });

             if (callback) {callback();}
           });
         };

         function readFile(file, pos) {
           rBox.readFile(file, 'readAsArrayBuffer', function(data) {
             filedata[pos] = data;

             if (++numFiles === imgFileObj.files.length) {
               // all files have been read
               if (imgFileObj.imgType === 'dicom' || imgFileObj.imgType === 'dicomzip') {

                 // if the files are zip files of dicoms then unzip them and sort the resultant files
                 if (imgFileObj.imgType === 'dicomzip') {
                   var fDataArr = [];

                   for (var i=0; i<filedata.length; i++) {
                     fDataArr = fDataArr.concat(rBox.unzipFileData(filedata[i]));
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

                 //update the thumbnail info with the series description
                 var byteArray = new Uint8Array(filedata[0]);
                 try {
                   var dataSet = dicomParser.parseDicom(byteArray);
                   title = dataSet.string('x0008103e');
                   info = title.substr(0, 10);
                   jqImg.attr('title', title);
                   $('.view-thumbnail-info', jqTh).text(info);
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
    };

    /**
     * Remove event handlers and html interface.
     */
     thbarjs.ThumbnailBar.prototype.destroy = function() {

       this.numThumbnails = 0;
       this.numOfLoadedThumbnails = 0;
       this.jqThBar.empty();
       this.jqThBar = null;
     };


    return thbarjs;
  });
