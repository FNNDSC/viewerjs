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
    * @param {Object} realtime collaborator object.
    */
    chatjs.Chat = function(collab) {

      this.version = 0.0;
      // jQuery chat object
      this.jqChat = null;
      // collaborator object
      this.collab = collab;
      // current colaborators list
      //this.collabotators = collab.getCollaboratorList();

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
       var jqChat = $('<div></div>');

       this.jqChat = jqChat;
       // convert the previous div into a floating window with minimize, collapse and expand buttons
       jqChat.dialog({
         title: "Collab room: " + this.collab.realtimeFileId,
         minHeight: 300,
         height: 350,
         minWidth: 500,
         width: 650
       }).dialogExtend({
        "closable" : false,
        "maximizable" : true,
        "minimizable" : true,
        "collapsable" : true,
        "dblclick" : "collapse",
        "icons" : {
          "maximize" : "ui-icon-arrow-4-diag"
        }
      });

      // add the HTML contents to the floating window
      jqChat.append(
        '<div class="view-chat-usersarea"></div>' +
        '<div class="view-chat-msgarea">' +
          '<div class="view-chat-msgarea-header"></div>' +
          '<div class="view-chat-msgarea-content">' +
            '<textarea class="view-chat-msgarea-content-text">You are connected!</textarea>' +
            '<div class="view-chat-msgarea-content-input">' +
              '<button type="button">Send msg</button>' +
              '<input type="text">' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      var jqChatMsgArea = $('.view-chat-msgarea', jqChat);
      $('.view-chat-msgarea-header', jqChatMsgArea).text('You can email to other collaborators ' +
          'the collaboration room id:  ' + this.collab.realtimeFileId);

      // lay out the contents
      var usersAreaWidth = parseInt($('.view-chat-usersarea', jqChat).css('width'));
      jqChatMsgArea.css({ width: 'calc(100% - ' + usersAreaWidth + 'px)' });


      var jqChatInputArea = $('.view-chat-msgarea-content-input', jqChatMsgArea);
      var inputAreaHeight = parseInt(jqChatInputArea.css('height'));
      var buttonWidth = parseInt($('button', jqChatInputArea).css('width'));
      var headerHeight = parseInt($('.view-chat-msgarea-header', jqChatMsgArea).css('height'));

      $('.view-chat-msgarea-content', jqChatMsgArea).css({
        height: 'calc(100% - ' + headerHeight + 'px)'
        });

      $('input', jqChatInputArea).css({ width: 'calc(100% - ' + buttonWidth + 'px)' });

      $('.view-chat-msgarea-content-text', jqChatMsgArea).css({
        height: 'calc(100% - ' + (inputAreaHeight+6) + 'px)'
        });
    };

    /**
     * Update the list of collaborators.
     */
     chatjs.Chat.prototype.updateCollaboratorList = function() {

    };

    return chatjs;
  });
