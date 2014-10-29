#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json

import tornado.web
import tornado.ioloop
import sockjs.tornado

from bson import json_util

import pymongo


class MainHandler(tornado.web.RequestHandler):
    def get(self, *args, **kwargs):
        messages = sorted(list(db.chat.find().sort("$natural", -1).limit(35)), key=lambda message: message['time'])
        for message in messages:
            if not 'id' in message.keys():
                message['id'] = str(message["_id"])
                del message['_id']
        self.render('index.html', messages=messages)


class WebSocket(sockjs.tornado.SockJSConnection):
    webSocketsPool = set()

    def on_open(self, info):
        self.webSocketsPool.add(self)

    def on_message(self, message):
        message_dict = json.loads(message)
        db.chat.insert(message_dict)
        message = json.dumps(message_dict, default=json_util.default)
        self.broadcast(self.webSocketsPool, message)

    def on_close(self):
        self.webSocketsPool.remove(self)

    def check_origin(self, origin):
        return True

if __name__ == '__main__':
    # import logging
    # logging.getLogger().setLevel(logging.DEBUG)

    connection = pymongo.Connection('127.0.0.1', 27017)
    db = connection.chat

    ChatRouter = sockjs.tornado.SockJSRouter(WebSocket, '/chat')
    handlers = [
            (r'/static/(.*)', tornado.web.StaticFileHandler, {'path': './static'}),
            (r'/', MainHandler)
    ]

    app = tornado.web.Application(handlers + ChatRouter.urls)
    app.listen(3000)
    tornado.ioloop.IOLoop.instance().start()