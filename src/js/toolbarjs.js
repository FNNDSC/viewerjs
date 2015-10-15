/**
 * This module implements a tool bar
 */

// define a new module
define(['jquery_ui'], function() {

  /**
   * Provide a namespace for the tool bar module
   *
   * @namespace
   */
   var toolbarjs = toolbarjs || {};

   /**
    * Class implementing the tool bar
    *
    * @constructor
    * @param {String} HTML container's id.
    */
    toolbarjs.ToolBar = function(containerId) {

      this.version = 0.0;
      // toolbar container's ID
      this.contId = containerId;
      // jQuery object for the bar's div element (tool bar container)
      this.jqToolBar = null;
      // associative array of button event handlers
      this.eventHandlers = null;
      // scene object
      this.scene = null;
    };

    /**
     * Initialize the tool bar.
     */
     toolbarjs.ToolBar.prototype.init = function() {

       // return if tool bar already initialized
       if (this.jqToolBar) {
         return;
       }

       // set jQuery obj for the tool bar
       this.jqToolBar = $('#' + this.contId);

       // add the appropriate classes
       this.jqToolBar.addClass("view-toolbar");

       // initialize array of button event handlers
       this.eventHandlers = {};
     };

    /**
     * Add a new button to the tool bar.
     *
     * @param {Object} object containing button's properties: id (HTML id), title, caption, onclick
     */
     toolbarjs.ToolBar.prototype.addButton = function(btnProps) {
       var jqToolBar = this.jqToolBar;

       // append a new button to the tool bar
       jqToolBar.append(
         '<button id="' + btnProps.id + '" class="view-toolbar-button" type="button" title="' +
          btnProps.title + '">' + btnProps.caption + '</button>'
       );

       this.eventHandlers[btnProps.id] = {};
       // set a click event handler if provided
       if (btnProps.onclick) {
         this.setButtonClickHandler(btnProps.id, btnProps.onclick);
       }
     };

    /**
     * Set a click event handler for a button.
     *
     * @param {String} HTML DOM identifier of the button.
     * @param {Function} event handler.
     */
     toolbarjs.ToolBar.prototype.setButtonClickHandler = function(btnId, handler) {

       if (btnId  && (btnId in this.eventHandlers) && handler) {
         this.eventHandlers[btnId].onclick = handler;

         $('#' + btnId).click(handler);
       }
     };

    /**
     * Hide a toolbar button.
     *
     * @param {String} HTML DOM identifier of the button.
     */
     toolbarjs.ToolBar.prototype.hideButton = function(btnId) {

       $('#' + btnId).css({display: 'none' });
     };

    /**
     * Show a toolbar button.
     *
     * @param {String} HTML DOM identifier of the button.
     */
     toolbarjs.ToolBar.prototype.showButton = function(btnId) {

       $('#' + btnId).css({display: '' });
     };

    /**
     * Remove event handlers and html interface.
     */
     toolbarjs.ToolBar.prototype.destroy = function() {

       this.eventHandlers = null;
       this.jqToolBar.empty();
       this.jqToolBar = null;
     };


    return toolbarjs;
  });
