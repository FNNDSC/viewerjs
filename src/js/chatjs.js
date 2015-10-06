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
      // jQuery chat object (chat window content)
      this.jqChat = null;
      // jQuery preferences object (preferences window content)
      this.jqPreferences = null;
      // collaborator object
      this.collab = collab;

      //
      // Collaboration event listeners
      //
      var self = this;

      // This method is called when a new chat msg is received from a remote collaborator
      this.collab.onNewChatMessage = function(msgObj) {
        self.updateTextArea(msgObj);
      };

      // This method is called everytime a remote collaborator disconnects from the collaboration
      this.collab.onDisconnect = function(collaboratorInfo) {
        // create a chat message object
        var msgObj = {user: collaboratorInfo.name, msg: 'I have disconnected.'};

        self.updateTextArea(msgObj);
        self.updateCollaboratorList();
      };
    };

   /**
    * Intialize the chat.
    */
    chatjs.Chat.prototype.init = function() {
      this.initChatWindow();
      this.initPreferencesWindow();
      this.collab.sendChatMsg('I have connected!');
      this.updateCollaboratorList();
    };

   /**
    * Initilize Chat window's HTML and event handlers.
    */
    chatjs.Chat.prototype.initChatWindow = function() {
      var jqChat = $('<div></div>');
      var self = this;

      this.jqChat = jqChat;
      // convert the previous div into a floating window with minimize, collapse and expand buttons
      jqChat.dialog({
        title: "Collaboration chat",
        closeOnEscape: false,
        minHeight: 350,
        height: 400,
        minWidth: 550,
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

     // add the preferences button to the floating window's title bar
     $('.ui-dialog-titlebar-buttonpane', jqChat.parent()).append(
       '<a class="ui-dialog-titlebar-preferences ui-corner-all ui-state-default" href="#" role="button">' +
       '<span class="ui-icon ui-icon-gear" title="preferences">preferences</span></a>'
     );

     // add the HTML contents to the floating window
     jqChat.append(
       '<div class="view-chat-usersarea view-chat-usersarea-theme1"><ul></ul></div>' +
       '<div class="view-chat-msgarea view-chat-theme1">' +
         '<div class="view-chat-msgarea-header view-chat-msgarea-header-theme1">Room id: ' +
            this.collab.realtimeFileId + '</div>' +
         '<textarea class="view-chat-msgarea-text view-chat-theme1" disabled>You are connected!</textarea>' +
         '<div class="view-chat-msgarea-input view-chat-theme1">' +
           '<button class="view-chat-msgarea-input-button view-chat-msgarea-input-button-theme1"' +
              'type="button">Send msg</button>' +
           '<input class="view-chat-msgarea-input-input view-chat-theme1" type="text">' +
         '</div>' +
       '</div>'
     );

     $(self.jqChat.parent()).css('borderColor', $('.view-chat-msgarea', self.jqChat).css('borderColor'));

     // lay out elements
     this.layoutChatWindow();

     //
     // UI event handlers
     //
     var jqButtonPreferences = $('.ui-dialog-titlebar-preferences', jqChat.parent());
     var jqButtonSend = $('button', jqChat);
     var jqInput = $('input', jqChat);

     // Title bar's Preferences (gear) button click
     jqButtonPreferences.mouseover(function() {
       return $(this).addClass("ui-state-hover");
     }).mouseout(function() {
       return $(this).removeClass("ui-state-hover");
     }).focus(function() {
       return $(this).addClass("ui-state-focus");
     }).blur(function() {
       return $(this).removeClass("ui-state-focus");
     }).click(function() {
       self.jqPreferences.dialog("open");
     });

     // Send msg button click
     jqButtonSend.click(function() {
       var text = jqInput[0].value;

       if (text) {
         jqInput[0].value = '';
         // create a chat message object
         var msgObj = {user: self.collab.collaboratorInfo.name, msg: text};
         self.updateTextArea(msgObj);
         self.collab.sendChatMsg(text);
       }
     });

     // Enter key press
     jqInput.keyup(function(evt) {
       if (evt.keyCode === 13) {
         jqButtonSend.click();
       }
     });

    };

    /**
     * Lay out the chat window.
     */
    chatjs.Chat.prototype.layoutChatWindow = function() {
      var jqChatMsgArea = $('.view-chat-msgarea', this.jqChat);
      var headerHeight = parseInt($('.view-chat-msgarea-header', jqChatMsgArea).css('height'));
      var inputAreaHeight = parseInt($('.view-chat-msgarea-input', jqChatMsgArea).css('height'));

      $('.view-chat-msgarea-text', jqChatMsgArea).css({
        top: headerHeight + 'px',
        height: 'calc(100% - ' + (inputAreaHeight+headerHeight) + 'px)'
      });
    };

    /**
     * Initilize Preferences window's HTML and event handlers.
     */
    chatjs.Chat.prototype.initPreferencesWindow = function() {
       var jqPreferences = $('<div></div>');
       var self = this;

       this.jqPreferences = jqPreferences;
       // convert the previous div into a floating window with a close button
       jqPreferences.dialog({
         title: "Preferences",
         modal: true,
         autoOpen: false,
         minHeight: 330,
         height: 350,
         minWidth: 450,
         width: 600
       });

       // add the HTML contents to the floating window
       jqPreferences.append(
       '<div class="view-chat-preferences">' +
          '<h3>Message style</h3>' +
          '<div>' +
            '<input class="view-chat-preferences-msgstyle" type="radio" name="msgstyle" value="headerbefore"' +
              ' checked="checked">Msg header on same line<br>' +
            '<input class="view-chat-preferences-msgstyle" type="radio" name="msgstyle" value="headerabove"' +
              '>Msg header on previous line' +
          '</div>' +

          '<h3>Message header info</h3>' +
          '<div>' +
            '<input class="view-chat-preferences-msgstyle" type="radio" name="msgheaderinfo" value="name"' +
              ' checked="checked">Name<br>' +
            '<input class="view-chat-preferences-msgstyle" type="radio" name="msgheaderinfo" value="timename"' +
              '>[hh:mm] Name' +
          '</div>' +

          '<h3>Font size</h3>' +
          '<div>' +
            '<span class="view-chat-preferences-fontsize" title="decrease">-</span>' +
            '<span class="view-chat-preferences-fontsize" title="increase">+</span>' +
          '</div>' +

          '<h3>Font family</h3>' +
          '<div>' +
            '<input class="view-chat-preferences-fontfamily" type="radio" name="fontfamily" value="standard"' +
              ' checked="checked">Standard<br>' +
            '<input class="view-chat-preferences-fontfamily" type="radio" name="fontfamily" value="fixedwidth"' +
              '>Fixed width' +
          '</div>' +

          '<h3>Themes</h3>' +
          '<div>' +
            '<input class="view-chat-preferences-theme" type="radio" name="theme" value="darkbackground"' +
              ' checked="checked">Light font on dark background<br>' +
            '<input class="view-chat-preferences-theme" type="radio" name="theme" value="lightbackground"' +
              '>Dark font on light background' +
          '</div>' +
       '</div>'
       );

       jqPreferences.data('preferences', {
         msgStyle: 'headerbefore',
         msgHeaderInfo: 'name',
         fontSize: $('.view-chat-msgarea-text', this.jqChat).css('fontSize'),
         fontFamily: {standard: 'sans-serif', fixedwidth: 'monospace'},
         currentTheme: 'darkbackground',
         themes: {
           'darkbackground': {
             generalTheme: "view-chat-theme1",
             headerAreaTheme: "view-chat-msgarea-header-theme1",
             userAreaTheme: "view-chat-usersarea-theme1",
             buttonSendTheme: "view-chat-msgarea-input-button-theme1"
           },
           'lightbackground': {
             generalTheme: "view-chat-theme2",
             headerAreaTheme: "view-chat-msgarea-header-theme2",
             userAreaTheme: "view-chat-usersarea-theme2",
             buttonSendTheme: "view-chat-msgarea-input-button-theme2"
           }
         }
       });

       //
       // UI event handlers
       //

       // change msg style or msg header
       $('.view-chat-preferences-msgstyle', jqPreferences).click(function() {
         var preferences = jqPreferences.data('preferences');
         var name = $(this).attr('name');
         var value = $(this).attr('value');

         if (name === 'msgstyle') {
           preferences.msgStyle = value;
         } else {
           preferences.msgHeaderInfo = value;
         }

         jqPreferences.data('preferences', preferences);
       });

       // change font size
       $('.view-chat-preferences-fontsize', jqPreferences).click(function() {
         var preferences = jqPreferences.data('preferences');
         var title = $(this).attr('title');
         var fontSize = preferences.fontSize;
         var size = parseInt(preferences.fontSize);
         var measUnit = fontSize.slice(-2);
         var delta = 0;

         if (title === 'increase') {
           if (measUnit === 'px' && size < 22) {
             delta = 1;
           } else if (measUnit === 'em' && size < 1.5) {
             delta = 0.1;
           }
         } else {
           if (measUnit === 'px' && size > 10) {
             delta = -1;
           } else if (measUnit === 'em' && size > 0.8) {
             delta = -0.1;
           }
         }

         preferences.fontSize = (size + delta) + measUnit;
         jqPreferences.data('preferences', preferences);
         $('.view-chat-msgarea-text', self.jqChat).css({ fontSize: preferences.fontSize });
         $('.view-chat-msgarea-input-input', self.jqChat).css({ fontSize: preferences.fontSize });
         self.layoutChatWindow();
       });

       // change font family
       $('.view-chat-preferences-fontfamily', jqPreferences).click(function() {
         var preferences = jqPreferences.data('preferences');
         var value = $(this).attr('value');

         $('.view-chat-msgarea-text', self.jqChat).css('fontFamily', preferences.fontFamily[value]);
         $('.view-chat-msgarea-input-input', self.jqChat).css('fontFamily', preferences.fontFamily[value]);
         self.layoutChatWindow();
       });

       // change theme
       $('.view-chat-preferences-theme', jqPreferences).click(function() {
         var preferences = jqPreferences.data('preferences');
         var value = $(this).attr('value');
         var prevTheme = preferences.themes[preferences.currentTheme];
         var newTheme = preferences.themes[value];

         preferences.currentTheme = value;

         $('.view-chat-usersarea', self.jqChat).removeClass(prevTheme.userAreaTheme).addClass(newTheme.userAreaTheme);
         $('.view-chat-msgarea', self.jqChat).removeClass(prevTheme.generalTheme).addClass(newTheme.generalTheme);
         $('.view-chat-msgarea-header', self.jqChat).removeClass(prevTheme.headerAreaTheme).addClass(newTheme.headerAreaTheme);
         $('.view-chat-msgarea-text', self.jqChat).removeClass(prevTheme.generalTheme).addClass(newTheme.generalTheme);
         $('.view-chat-msgarea-input', self.jqChat).removeClass(prevTheme.generalTheme).addClass(newTheme.generalTheme);
         $('.view-chat-msgarea-input-input', self.jqChat).removeClass(prevTheme.generalTheme).addClass(newTheme.generalTheme);
         $('.view-chat-msgarea-input-button', self.jqChat).removeClass(prevTheme.buttonSendTheme).addClass(newTheme.buttonSendTheme);

         $(self.jqChat.parent()).css('borderColor', $('.view-chat-msgarea', self.jqChat).css('borderColor'));
       });
    };

    /**
     * Update the chat text area with new text.
     *
     * @param {Obj} chat message object.
     */
     chatjs.Chat.prototype.updateTextArea = function(msgObj) {
       var chatTextarea = $('.view-chat-msgarea-text', this.jqChat)[0];
       var preferences = this.jqPreferences.data('preferences');
       var time = "";

       if (preferences.msgHeaderInfo === 'timename') {
         // add timestamp to msg header
         var d = new Date();
         var h = (d.getHours()<10 ? '0' : '') + d.getHours();
         var m = (d.getMinutes()<10 ? '0' : '') + d.getMinutes();

         time = '[' + h + ':' + m + '] ';
       }

       if (preferences.msgStyle === 'headerbefore') {
         chatTextarea.innerHTML += '&#xA;' + time + msgObj.user + ': ' + msgObj.msg;
       } else {
         // header above msg
         chatTextarea.innerHTML += '&#xA;' + time + msgObj.user + ':' + '&#xA;' + msgObj.msg;
       }
       // scroll down to show last msg
       chatTextarea.scrollTop = chatTextarea.scrollHeight;
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
       this.jqChat.dialogExtend("restore");
       this.jqChat.dialog("destroy");
       this.jqPreferences.dialog("destroy");
       this.jqChat.empty();
    };

    return chatjs;
  });
