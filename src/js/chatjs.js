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
        self.updateTextArea(msgObj);
      };

      // This method is called everytime a remote collaborator disconnects from the collaboration
      this.collab.onDisconnect = function(collaboratorInfo) {
        // create a chat message object
        var msgObj = {user: collaboratorInfo.name, msg: 'has disconnected.'};

        self.updateTextArea(msgObj);
        self.updateCollaboratorList();
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

      // lay out elements
      var jqChatMsgArea = $('.view-chat-msgarea', jqChat);
      var headerHeight = parseInt($('.view-chat-msgarea-header', jqChatMsgArea).css('height'));
      var inputAreaHeight = parseInt($('.view-chat-msgarea-input', jqChatMsgArea).css('height'));

      $('.view-chat-msgarea-header', jqChatMsgArea).text('Room id: ' + this.collab.realtimeFileId);
      $('.view-chat-msgarea-text', jqChatMsgArea).css({
        height: 'calc(100% - ' + (inputAreaHeight+headerHeight) + 'px)'
      });

      this.collab.sendChatMsg('I have connected!');
      this.updateCollaboratorList();

      //
      // UI event handlers
      //
      var jqButton = $('button', jqChat);
      var jqInput = $('input', jqChat);
      var chatTextarea = $('.view-chat-msgarea-text', jqChat)[0];

      // send msg button click
      jqButton.click(function() {
        var text = jqInput[0].value;

        if (text) {
          jqInput[0].value = '';
          chatTextarea.innerHTML += '&#xA;' + self.collab.collaboratorInfo.name + ': ' + text;
          self.collab.sendChatMsg(text);
        }
      });

      // Enter key press
      jqInput.keyup(function(evt) {
        if (evt.keyCode === 13) {
          jqButton.click();
        }
      });
    };

    /**
     * Update the chat text area with new text.
     *
     * @param {Obj} chat message object.
     */
     chatjs.Chat.prototype.updateTextArea = function(msgObj) {
       var chatTextarea = $('.view-chat-msgarea-text', this.jqChat)[0];
       var text = msgObj.user + ': ' + msgObj.msg;

       chatTextarea.innerHTML += '&#xA;' + text;
    };

    /**
     * Update the list of collaborators in the UI.
     */
     chatjs.Chat.prototype.updateCollaboratorList = function() {
       var collaborators = this.collab.getCollaboratorList();
       var jqUsersArea = $('.view-chat-usersarea', this.jqChat);
       var ul = $('ul', jqUsersArea).empty();

       for (var i=0; i<collaborators.length; i++) {
         if (collaborators[i].id === this.collab.collaboratorInfo.id) {
           ul.prepend('<li>' + this.collab.collaboratorInfo.name + ' (me)</li>');
         } else {
           ul.append('<li>' + collaborators[i].name + '</li>');
         }
       }
    };

    /**
     * Hide chat window.
     */
     chatjs.Chat.prototype.close = function() {
       this.jqChat.dialog("close");
    };

    /**
     * Show chat window.
     */
     chatjs.Chat.prototype.open = function() {
       this.jqChat.dialog("open");
    };

    /**
     * Whether the chat is currently open.
     */
     chatjs.Chat.prototype.isOpen = function() {
       return this.jqChat.dialog("isOpen");
    };

    /**
     * Destroy all objects and remove html interface
     */
     chatjs.Chat.prototype.destroy = function() {
       this.jqChat.dialog("destroy");
       this.jqChat.empty();
    };

    return chatjs;
  });
