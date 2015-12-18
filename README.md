# viewerjs

This is a reusable JavaScript module that exposes a <tt>viewerjs.Viewer</tt> class that provides methods
for easily embedding a neuroimage visualization object (VObj) within an HTML page. The <tt>viewerjs.Viewer</tt>
constructor only requires as an input the DOM identifier of the HTML element on which the resultant
VObj's HTML interface is inserted. The following code shows the simplicity of the method calls:

````
var view = new viewerjs.Viewer(divId);
view.init();
view.addData(imgFileArr);
````

The VObj can asynchronously load more than one neuroimage volume specified by the <tt>imgFileArr</tt> variable
passed to the <tt>addData</tt> method. This is an array of custom file objects where each object entry has the
following properties:
* url: String representing the file’s url/local path (required)
* file: HTML5 File object (optional but necessary when the files are gotten through a local file-picker
  or drop-zone)
* cloudId: String representing the file cloud identifier (optional but necessary when the files are gotten
  from a cloud storage service such as Google Drive)

Thus the VObj can load image data from diverse sources such as a hooked back-end using the provided <tt>url</tt>,
a local filesystem using the <tt>file</tt> property or the Google Drive storage service using the <tt>cloudId</tt>
property. More data can be added to the viewer by repeatedly calling the <tt>addData</tt> method which creates a new
tumbnails bar for each dataset (users can also interactively add more data by dragging files/folder onto the viewer).

The <tt>viewerjs.Viewer</tt> constructor can also accept a [gcjs.GDriveCollab](https://github.com/FNNDSC/gcjs)
object as an optional second parameter to enable realtime collaboration among remote visualizations. The
resultant VObj delegates the synchronization of the data describing the visualization state on that object.

Please take a look at the [wiki](https://github.com/FNNDSC/viewerjs/wiki) to learn how to interact with the VObj
through peripheral device controls.

An example live web application that uses <tt>viewerjs.Viewer</tt> is running here: <http://mi2b2.babymri.org/>.

## Build
This project uses grunt.

### Pre-requisites:
* NodeJs - http://nodejs.org/

* Ensure that your npm is up-to-date:

````
sudo npm update -g npm
````

* Install grunt's command line interface (CLI) globally:

````
sudo npm install -g grunt-cli
````

* Install grunt and gruntplugins listed at "devDependencies" in package.json:

````
npm install
````

* Install bower:

````
sudo npm install -g bower
````

* Install dependencies listed in bower.json:

````
bower install
````

* Run grunt:

````
grunt
````

The project is built within the directory <tt>dist</tt>.
