$(function () {

    _.mixin({
      linkify : function(string) {
        var replacedText, replacePattern1, replacePattern2, replacePattern3;

        //URLs starting with http://, https://, or ftp://
        replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
        replacedText = string.replace(replacePattern1, '<a href="$1" target="_blank">$1</a>');

        //URLs starting with "www." (without // before it, or it'd re-link the ones done above).
        replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
        replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2" target="_blank">$2</a>');

        //Change email addresses to mailto:: links.
        replacePattern3 = /(([a-zA-Z0-9\-\_\.])+@[a-zA-Z\_]+?(\.[a-zA-Z]{2,6})+)/gim;
        replacedText = replacedText.replace(replacePattern3, '<a href="mailto:$1">$1</a>');

        return replacedText;
      }
    });

    var parseTwemoji = function(selector){
        selector = selector ? $(selector) : $('.room-textarea');
        twemoji.parse(selector[0], {folder: 'svg', ext: '.svg'});
    };

    var pasteHtmlAtCaret = function(html) {
        var sel, range;
        if (window.getSelection) {
            // IE9 and non-IE
            sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);
                range.deleteContents();

                var el = document.createElement("div");
                el.innerHTML = html;
                var frag = document.createDocumentFragment(), node, lastNode;
                while ( (node = el.firstChild) ) {
                    lastNode = frag.appendChild(node);
                }
                range.insertNode(frag);

                // Preserve the selection
                if (lastNode) {
                    range = range.cloneRange();
                    range.setStartAfter(lastNode);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        } else if (document.selection && document.selection.type != "Control") {
            // IE < 9
            document.selection.createRange().pasteHTML(html);
        }
    };

    var AppView;
    var colors = ["rgb(204, 198, 21)", "rgb(204, 20, 137)", "rgb(21, 204, 198)",
        "rgb(21, 204, 106)", "rgb(204, 30, 20)", "rgb(20, 147, 201)", "rgb(206, 107, 22)",
        "rgb(239, 161, 0)", "rgb(131, 217, 2)", "rgb(21, 69, 204)", "rgb(91, 20, 204)", "rgb(158, 20, 204)"];
    var Socket;
    Socket = {
        ws: null,
        init: function () {
            ws = new SockJS('http://' + window.location.hostname + ':3000/chat');
            ws.onopen = function () {
                console.log('Socket opened');
            };

            ws.onclose = function () {
                console.log('Socket close');
                ws = null;
            };

            ws.onmessage = function (e) {
                var msg = e.data;
                switch (msg.type) {
                    case 1:
                        var message = new Message(JSON.parse(msg.data));
                        Messages.add(message);
                        break;
                    case 2:
                        var me = _.findWhere(msg.data.list, {id: msg.data.id});
                        if (!_.isUndefined(me)) {
                            MyUser.set(me);
                            $('.room-textarea').removeAttr('readonly').prop('contenteditable', "true").text("").focus();
                            parseTwemoji('.help-con');
                            $('.room-input-menu').removeClass('hidden');
                            App.onTextAreaAutosize();
                        }
                        var _users = _.reject(msg.data.list, function (num) {
                            return _.isEqual(num, me)
                        });
                        OnlineUsers.add(_users);
                        break;
                    case 3:
                        var newUser = new User(msg.data);
                        OnlineUsers.add(newUser);
                        break;
                    case 4:
                        if(!_.isUndefined(msg.data))
                            OnlineUsers.get(msg.data).destroy();
                        break;
                    case 101:
                        App.lastMessage = $('#chat-messages').find('ul .message').first();
                        _.each(JSON.parse(msg.data).reverse(), function(elem){
                            var message = new Message(elem);
                            Messages.add(message, {at: 0});
                        });
                        App.isLoading = false;
                        break;
                    case 401:
                        $('.room-textarea').attr('readonly');
                        break;
                }
            };
            this.ws = ws;
        }
    };

    Socket.init();
    var socket = Socket.ws;

    var Message = Backbone.Model.extend({
        idAttribute: "_id",
        defaults: function () {
            return {
                user: MyUser,
                text: null,
                time: Date.now()
            };
        },
        save: function (options) {
            socket.send(JSON.stringify({type: 1, data: this}));
        }
    });

    var MessageList = Backbone.Collection.extend({

        model: Message,

        comparator: function(model) {
          return model.get("time");
        }

    });

    var Messages = new MessageList;

    var MessageView = Backbone.View.extend({

        tagName: 'li',

        className: 'message',

        template: _.template($('#message-template').html()),

        initialize: function () {
            this.model.get('text');
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'destroy', this.remove);
        },

        render: function () {
            this.$el.html(this.template(this.model.toJSON()));
            parseTwemoji(this.$el);
            var modelUser = this.model.toJSON().user;
            if(!_.isEqual(modelUser, 'testUser')) {
                this.$el.find('strong').text(modelUser.nickname);
            }
            this.$el.attr('data-id', this.model.id);
            return this;
        }
    });

    var User = Backbone.Model.extend({
       defaults: function(){
           return {
               id: null,
               nickname: null,
               email: null,
               color: colors[_.random(colors.length-1) ]
           }
       }

    });

    var UserList = Backbone.Collection.extend({
        model: User
    });

    var MyUser = new User();

    var OnlineUsers = new UserList;

    var RosterView = Backbone.View.extend({

        tagName: 'li',

        className: 'roster-item',

        template: _.template($('#roster-template').html()),

        initialize: function () {
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'destroy', this.remove);
        },

        render: function () {
            this.$el.html(this.template(this.model.toJSON()));
            return this;
        }
    });

    AppView = Backbone.View.extend({

        el: $('#backbone-chat'),
        lastMessage: $('.message').last(),

        defaultEvents: {
            'swipeleft': 'swipeUserList',
            'swiperight': 'swipeUserList'
        },

        events: {
            'keydown .room-textarea': 'keyPressTextarea',
            'keyup .room-textarea': 'keyUpTextarea',
            'click .help-con a img': 'insertSmile',
            'click .main': 'closeUserList'
        },

        initialize: function () {
            this.textInput = this.$('.room-textarea');

            $(window).on("resize", this.resizeTextareaMaxHeight);
            $('.infinite-scroll').on('scroll', this.checkScroll);
            $('.room-input-menu').on('shown.bs.dropdown hidden.bs.dropdown', function () {
              $('.room-textarea').focus();
            });

            this.events = _.extend({}, this.defaultEvents, this.events||{});

		    this.userListOpen = false;
            this.isLoading = false;
            this.lastMessage = null;

            this.listenTo(Messages, 'add', this.addOne);
            this.listenTo(Messages, 'reset', this.addAll);

            this.listenTo(MyUser, 'all', this.renderRosterHead);
            this.listenTo(OnlineUsers, 'add', this.addUser);

            Messages.reset(preloadMessages);
            this.$el.hammer();
            this.onTextAreaAutosize();
        },

        insertSmile: function(evt){
            var text = '&nbsp;' + evt.target.alt + '&nbsp;';
            if(!_.isUndefined(text)) {
                this.textInput.focus();
                pasteHtmlAtCaret(twemoji.parse(text, {folder: 'svg', ext: '.svg'}));
            }
        },

        checkScroll: function() {
            if($(this).scrollTop() < 120 && !App.isLoading){
                socket.send(JSON.stringify({
                   type: 101,
                   data: Messages.length
                }));
                App.isLoading = true;
            }
        },

        swipeUserList: function(e){
            if(e.type=='swipeleft' && !this.userListOpen){
                this.openUserList()
            }
            if(e.type=='swiperight' && this.userListOpen) {
                this.closeUserList()
            }
        },

        openUserList: function() {
            $('.roster').addClass('swiped');
            this.userListOpen = true;
        },

        closeUserList: function() {
            $('.roster').removeClass('swiped');
            this.userListOpen = false;
        },

        addUser: function(user){
            var view = new RosterView({
                model: user,
                id: "roster-item-"+user.id
            });
            this.$('.roster-part').append(view.render().el);
        },

        renderRosterHead: function() {
            var roster_name = MyUser.get('nickname');
            var roster_email = MyUser.get('email');
            $('span.roster-my-name').text(roster_name).attr('title', roster_name);
            $('span.roster-my-email').text(roster_email).attr('title', roster_email);
        },

        addOne: function (message) {
            var view = new MessageView({
                model: message
            });
            var messageList = this.$('#chat-messages ul');
            if(Messages.indexOf(message) == 0) {
                messageList.prepend(view.render().el);
                if(!_.isNull(this.lastMessage))
                    this.lastMessage[0].scrollIntoView();
            }
            else {
                messageList.append(view.render().el);
                if( messageList[0].scrollHeight - messageList.height() - messageList.scrollTop() < 200)
                    this.$('.message').last()[0].scrollIntoView();
            }
        },

        addAll: function () {
            Messages.each(this.addOne, this);
        },

        createOnSubmit: function () {
            this.textInput.removeClass('error');

            this.textInput.find('img').replaceWith(function() { return this.alt; });

            if (!this.textInput.text().trim()) {
                this.textInput.addClass('error');
                this.textInput.focus();
                return false;
            }

           socket.send(JSON.stringify({
               type: 1,
               data: {
                   user: MyUser,
                   text: _.escape($.trim(this.textInput[0].textContent || this.textInput[0].innerText)),
                   time: Date.now()
               }
            }));

            this.onTextAreaAutosize();
            return false;
        },

        keyPressTextarea: function (evt) {
            var msg = this.textInput[0].innerHTML;
            if (13 === evt.keyCode || 10 === evt.keyCode) {
                if (evt.ctrlKey || evt.shiftKey) {
                    document.execCommand('insertHTML', false, '<br><br>');
                    this.onTextAreaAutosize();
                    return false;
                } else {
                    if ($.trim(msg).length > 0) {
                        this.createOnSubmit();
                        this.textareaSetValue("");
                    }
                }
                this.onTextAreaAutosize();
                return false;
            }
            this.onTextAreaAutosize();
        },

        keyUpTextarea: function(e){
            parseTwemoji();
        },

        textareaSetValue: function (val, selector) {
            selector = selector ? $(selector) : this.textInput;
            selector.text(val);
        },

        onTextAreaAutosize: function (info) {
            info = info ? info : this.textInput[0];
            $('#chat-messages').css('padding-bottom', info.clientHeight + 18);
            $('#chat-messages').css('margin-bottom', -(info.clientHeight + 18));
        },

        resizeTextareaMaxHeight: function(){
            _.throttle(
                $('.room-textarea')
                    .css("max-height", Math.round(($(window).height() - 50) / 2 - 50))
                ,100)
        }

    });

    Backbone.sync = function(method, model) {
//        console.log(method + ': ' + JSON.stringify(model));
    };

    var App = new AppView;

});
