/**
 * This module implements the realtime chat interface
 */

// define a new module
define(['jqdlgext'], function() {

  /**
   * Provide a namespace for the chat module
   *
   * @namespace
   */
   var chatjs = chatjs || {};

   /**
    * Class implementing the the realtime chat
    *
    * @constructor
    * @param {String} id of the HTML div to be created.
    */
    chatjs.Chat = function(containerID, collab) {

      this.version = 0.0;
      // chat container's ID
      this.containerId = containerID;
      // collaborator object
      this.collab = collab;
      // current colaborators list
      this.collabotators = collab.getCollaboratorList();

      // Collaboration event listeners
      var self = this;

      // This method is called when a new chat msg is received from a remote collaborator
      this.collab.onNewChatMessage = function(msgObj) {
        var chatTextarea = document.getElementById('chattextarea');
        var text = msgObj.user + ': ' + msgObj.msg;

        chatTextarea.innerHTML += '&#xA;' + text;
      };
    };

    /**
     * Insert chat's HTML.
     */
     chatjs.Chat.prototype.init = function() {
       var self = this;

       var jqChat = $('<div id="' + this.containerId + '"></div>');
       jqChat.dialog({title: "Collaboration chat"}).dialogExtend({
        "closable" : false,
        "maximizable" : true,
        "minimizable" : true,
        "collapsable" : true,
        "dblclick" : "collapse",
        "icons" : {
          "maximize" : "ui-icon-arrow-4-diag"
        }
      });

      jqChat.append('<div></div>');
      jqChat.append('<textarea>You are connected!</textarea>');
      jqChat.append('<button type="button">Send msg</button>');
      jqChat.append('<input type="text">');
      //$('#me', $('#' + this.containerId)).text("Hi man!");
    };

    /**
     * Update the list of collaborators.
     */
     chatjs.Chat.prototype.updateCollaboratorList = function() {

    };

    return chatjs;
  });
