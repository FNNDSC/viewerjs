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
        var chatTextarea = $('.view-chat-msgarea-text', self.jqChat)[0];
        var text = msgObj.user + ': ' + msgObj.msg;

        chatTextarea.innerHTML += '&#xA;' + text;
      };
    };

    /**
     * Insert chat's HTML.
     */
     chatjs.Chat.prototype.init = function() {
       var jqChat = $('<div></div>');
       var self = this;

       this.jqChat = jqChat;
       // convert the previous div into a floating window with minimize, collapse and expand buttons
       jqChat.dialog({
         title: "Collaboration chat",
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
        '<div class="view-chat-usersarea"><ul></ul></div>' +
        '<div class="view-chat-msgarea">' +
          '<div class="view-chat-msgarea-header"></div>' +
          '<textarea class="view-chat-msgarea-text" disabled>You are connected!</textarea>' +
          '<div class="view-chat-msgarea-input">' +
            '<button type="button">Send msg</button>' +
            '<input type="text">' +
          '</div>' +
        '</div>'
      );

      $('.view-chat-usersarea ul', jqChat).append('<li>' + this.collab.collaboratorInfo.name + ' (me)</li>');

      // lay out elements
      var jqChatMsgArea = $('.view-chat-msgarea', jqChat);
      var headerHeight = parseInt($('.view-chat-msgarea-header', jqChatMsgArea).css('height'));
      var inputAreaHeight = parseInt($('.view-chat-msgarea-input', jqChatMsgArea).css('height'));

      $('.view-chat-msgarea-header', jqChatMsgArea).text('Room id: ' + this.collab.realtimeFileId);
      $('.view-chat-msgarea-text', jqChatMsgArea).css({
        height: 'calc(100% - ' + (inputAreaHeight+headerHeight) + 'px)'
      });

      // UI event handlers
      $('button', jqChat).click(function() {
        var chatTextarea = $('.view-chat-msgarea-text', jqChat)[0];
        var chatInput = $('input', jqChat)[0];
        var text = chatInput.value;

        chatInput.value = '';
        chatTextarea.innerHTML += '&#xA;' + self.collab.collaboratorInfo.name + ': ' + text;
        self.collab.sendChatMsg(text);
      });
    };

    /**
     * Destroy all objects and remove html interface
     */
     chatjs.Chat.prototype.destroy = function() {
       this.jqChat.dialog("destroy");
       this.jqChat.empty();
    };

    /**
     * Update the list of collaborators.
     */
     chatjs.Chat.prototype.updateCollaboratorList = function() {

    };

    return chatjs;
  });
