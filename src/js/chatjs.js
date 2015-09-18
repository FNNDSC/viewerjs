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
       jqChat.dialog({title: "Collab room: ", height: 300, minWidth: 400, width: 700}).dialogExtend({
        "closable" : false,
        "maximizable" : true,
        "minimizable" : true,
        "collapsable" : true,
        "dblclick" : "collapse",
        "icons" : {
          "maximize" : "ui-icon-arrow-4-diag"
        }
      });
      jqChat.append(
        '<div class="view-chat-usersarea"></div>'
      ).append(
        '<textarea class="view-chat-msgarea">You are connected!</textarea>'
      ).append(
        '<div class="view-chat-inputarea"></div>'
      );
      var jqChatInputArea = $('.view-chat-inputarea', jqChat).append(
        '<button type="button">Send msg</button>'
      ).append(
        '<input type="text">'
      );
      var usersAreaWidth = parseInt($('.view-chat-usersarea', jqChat).css('width'));
      $('.view-chat-msgarea', jqChat).css({ width: 'calc(100% - ' + usersAreaWidth + 'px)' });
      $('.view-chat-inputarea', jqChat).css({ width: 'calc(100% - ' + usersAreaWidth + 'px)' });

      var buttonHeight = parseInt($('button', jqChatInputArea).css('height'));
      var buttonWidth = parseInt($('button', jqChatInputArea).css('width'));
      $('.view-chat-msgarea', jqChat).css({ height: 'calc(100% - ' + buttonHeight + 'px)' });
      $('input', jqChat).css({ width: 'calc(100% - ' + buttonWidth + 'px)' });
    };

    /**
     * Update the list of collaborators.
     */
     chatjs.Chat.prototype.updateCollaboratorList = function() {

    };

    return chatjs;
  });
