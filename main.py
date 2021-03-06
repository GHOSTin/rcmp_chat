#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json

import tornado.web
import tornado.ioloop
import tornado.escape
from tornado.httpclient import HTTPClient, HTTPError
import sockjs.tornado

from bson.objectid import ObjectId

import pymongo

import config

NEW_MESSAGE = 1
USERS_LIST = 2
NEW_USER = 3
USER_OFFLINE = 4
LOAD_HISTORY = 101
ERROR = 500
AUTH_ERROR = 401

allUsers = list()


class MainHandler(tornado.web.RequestHandler):
    def get(self, *args, **kwargs):
        self.render('index.html', messages=self.load_messages(), metrics=config.metrics)

    def load_messages(self, offset=0):
        messages = sorted(list(db.chat.find().sort("time", -1).skip(offset).limit(50)), key=lambda message: message['time'])
        for message in messages:
            message['_id'] = str(message["_id"])
        return json.dumps(messages)


class WebSocket(sockjs.tornado.SockJSConnection):
    webSocketsPool = set()
    onlineUsers = list()
    uid = None

    def on_open(self, info):
        message = dict()
        if info.get_cookie('uid'):
            http_client = tornado.httpclient.HTTPClient()
            try:
                response = http_client.fetch("http://rcmp.me/api/"+info.get_cookie('uid').value+'/get_user_info/')
                result = tornado.escape.json_decode(response.body)
                if result['error']:
                    message['type'] = AUTH_ERROR
                    message['data'] = "Не авторизован"
                    self.send(message)
                else:
                    user = result['user']
                    self.uid = user['id']
                    if not any(u['id'] == self.uid for u in allUsers):
                        allUsers.append(user)
                    self.onlineUsers.append(self.uid)
                    message['type'] = NEW_USER
                    message['data'] = user
                    self.broadcast(self.webSocketsPool, message)
            except tornado.httpclient.HTTPError as e:
                print("Error: " + str(e))
            http_client.close()
        else:
            message['type'] = AUTH_ERROR
            message['data'] = "Не авторизован"
            self.send(message)
        self.webSocketsPool.add(self)
        message['type'] = USERS_LIST
        message['data'] = dict()
        message['data']['id'] = self.uid
        message['data']['list'] = [i for i in allUsers if i['id'] in self.onlineUsers]
        self.send(message)

    def on_message(self, msg):
        message = dict()
        msg = tornado.escape.json_decode(msg)
        if msg['type'] == LOAD_HISTORY:
            message['type'] = LOAD_HISTORY
            message['data'] = MainHandler.load_messages(MainHandler, offset=msg['data'])
            self.send(message)
        if msg['type'] == NEW_MESSAGE:
            message_dict = msg['data']
            db.chat.insert(message_dict)
            message['type'] = NEW_MESSAGE
            message['data'] = json.dumps(message_dict, default=self.default)
            self.broadcast(self.webSocketsPool, message)

    def on_close(self):
        if self.uid in self.onlineUsers:
            self.onlineUsers.remove(self.uid)
        self.webSocketsPool.remove(self)
        message = dict()
        message['type'] = USER_OFFLINE
        message['data'] = self.uid
        self.broadcast(self.webSocketsPool, message)
        self.uid = None

    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)

if __name__ == '__main__':
    # import logging
    # logging.getLogger().setLevel(logging.DEBUG)

    http_client = tornado.httpclient.HTTPClient()
    try:
        response = http_client.fetch("http://rcmp.me/api/a7bdda50b1292bddfdee31f4a0d904b9db8a13e4/get_user_list/")
        allUsers += tornado.escape.json_decode(response.body)
    except tornado.httpclient.HTTPError as e:
        print("Error: " + str(e))
    except Exception as e:
        print("Error: " + str(e))
    http_client.close()

    connection = pymongo.Connection(config.mongo_host, config.mongo_post)
    db = connection.chat

    ChatRouter = sockjs.tornado.SockJSRouter(WebSocket, '/chat')
    handlers = [
            (r'/static/(.*)', tornado.web.StaticFileHandler, {'path': './static'}),
            (r'/', MainHandler)
    ]

    app = tornado.web.Application(handlers + ChatRouter.urls)
    app.listen(config.app_port)
    tornado.ioloop.IOLoop.instance().start()