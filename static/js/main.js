$(function () {

    var AppView;
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
                var message = new Message(JSON.parse(e.data));
                Messages.add(message);
            };
            this.ws = ws;
        }
    };

    Socket.init();
    var socket = Socket.ws;

    var Message = Backbone.Model.extend({
        defaults: function () {
            return {
                user: 'testUser',
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
            this.listenTo(Messages, 'all', this.render);

            Messages.reset(preloadMessages);
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
                user: 'testUser',
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
