$(function () {

    var AppView;
    var colors = ["rgb(102, 102, 102)", "rgb(204, 198, 21)", "rgb(204, 20, 137)", "rgb(21, 204, 198)",
        "rgb(21, 204, 106)", "rgb(204, 30, 20)", "rgb(20, 147, 201)", "rgb(206, 107, 22)",
        "rgb(239, 161, 0)", "rgb(131, 217, 2)", "rgb(21, 69, 204)", "rgb(91, 20, 204)", "rgb(158, 20, 204)"];
    var Socket = {
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
                switch(msg.type){
                    case 1:
                        var message = new Message(JSON.parse(msg.data));
                        Messages.add(message);
                        break;
                    case 2:
                        var me = _.findWhere(msg.data.list, {id: msg.data.id});
                        if(! _.isUndefined(me)){
                            MyUser.set(me);
                            Users.add(MyUser);
                        }
                        break;
                    case 3:
                        var newUser = new User(msg.data);
                        OnlineUsers.add(newUser);
                        Users.add(newUser);
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
            socket.send(JSON.stringify(this));
        }
    });

    var MessageList = Backbone.Collection.extend({

        model: Message

    });

    var Messages = new MessageList;

    var MessageView = Backbone.View.extend({

        tagName: 'li',

        className: 'message',

        template: _.template($('#message-template').html()),

        initialize: function () {
            this.model.get('text');
        },

        render: function () {
            this.$el.html(this.template(this.model.toJSON()));
            var modelUser = this.model.toJSON().user;
            if(!_.isEqual(modelUser, 'testUser')) {
                console.log(modelUser)
                this.$el.find('strong').css('color', modelUser.get('color')).text(modelUser.get('nickname'));
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
               color: colors[_.random(colors.length)]
           }
       }

    });

    var UserList = Backbone.Collection.extend({
        model: User
    });

    var MyUser = new User();

    var OnlineUsers = new UserList;

    var Users = new UserList;

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

        events: {
            'keydown .room-textarea': 'keyPressTextarea'
        },

        initialize: function () {
            if (this.lastMessage.length) {
                this.lastMessage[this.lastMessage.length].scrollIntoView();
            }
            this.textInput = this.$('.room-textarea');
            this.textInput.autosize({
                append: "",
                callback: this.onTextAreaAutosize
            });

            $(window).on("resize", this.resizeTextareaMaxHeight);

            this.listenTo(Messages, 'add', this.addOne);
            this.listenTo(Messages, 'reset', this.addAll);

            this.listenTo(MyUser, 'all', this.renderRosterHead);

            this.listenTo(OnlineUsers, 'add', this.addUser);

            Messages.reset(preloadMessages);
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
            this.$('#chat-messages ul').append(view.render().el);
            this.$('.message').last()[0].scrollIntoView();
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
                user: MyUser.toJSON,
                text: _.escape(this.textInput.val()),
                time: Date.now()
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
        console.log(method + ': ' + JSON.stringify(model));
    };

    var App = new AppView;

});
