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
                            $('.room-textarea').prop('readonly', false).attr('placeholder', "").trigger('autosize.resizeIncludeStyle');
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
                        $('.room-textarea').prop('readonly', true).attr('placeholder', msg.data).trigger('autosize.resizeIncludeStyle');
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
            'click .main': 'closeUserList'
        },

        initialize: function () {
            this.textInput = this.$('.room-textarea');
            this.textInput.autosize({
                append: "",
                callback: this.onTextAreaAutosize
            });

            $(window).on("resize", this.resizeTextareaMaxHeight);
            $('.infinite-scroll').on('scroll', this.checkScroll);

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
            emojify.setConfig({
                img_dir          : 'static/lib/emojify/images/emoji',
                ignored_tags     : {                // Ignore the following tags
                    'SCRIPT'  : 1,
                    'TEXTAREA': 1,
                    'A'       : 1,
                    'PRE'     : 1,
                    'CODE'    : 1
                }
            });
            emojify.run();
        },

        addAll: function () {
            Messages.each(this.addOne, this);
        },

        createOnSubmit: function () {
            this.textInput.removeClass('error');

            if (!this.textInput.val().trim()) {
                this.textInput.addClass('error');
                this.textInput.focus();
                return false;
            }

           socket.send(JSON.stringify({
               type: 1,
               data: {
                   user: MyUser,
                   text: _.escape(this.textInput.val()),
                   time: Date.now()
               }
            }));

            return false;
        },

        keyPressTextarea: function (evt) {
            if (13 === evt.keyCode || 10 === evt.keyCode) {
                var msg = evt.target.value;
                if (evt.ctrlKey || evt.shiftKey) {
                    var start = evt.target.selectionStart;
                    var end = evt.target.selectionEnd;
                    this.textareaSetValue(msg.substr(0, start) + "\n" + msg.substr(end));
                    evt.target.setSelectionRange(start + 1, start + 1);
                } else {
                    if ($.trim(msg).length > 0) {
                        this.createOnSubmit();
                        this.textareaSetValue("");
                    }
                }
                return false;
            }
        },

        textareaSetValue: function (val, selector) {
            selector = selector ? $(selector) : $("textarea");
            selector.val(val);
            selector.trigger("autosize.resize");
        },

        onTextAreaAutosize: function (info) {
            $('#chat-messages').css('padding-bottom', info.clientHeight + 28);
            $('#chat-messages').css('margin-bottom', -(info.clientHeight + 18));
        },

        resizeTextareaMaxHeight: function(){
            _.throttle(
                $('.room-textarea')
                    .css("max-height", Math.round(($(window).height() - 50) / 2 - 50)).trigger("autosize.resizeIncludeStyle")
                ,100)
        }

    });

    Backbone.sync = function(method, model) {
//        console.log(method + ': ' + JSON.stringify(model));
    };

    var App = new AppView;

});
