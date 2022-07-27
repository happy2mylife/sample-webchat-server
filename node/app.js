const MessageType = require("./node-enum.js");
const uuid = require("node-uuid");
const rooms = [];
const clientConnections = [];

const WebSocketServer = require("ws").Server;
const http = require("http");
const express = require("express");
const app = express();
const port = process.env.PORT || 5001;

app.use(express.static(__dirname + "/"));

const server = http.createServer(app);
server.listen(port);

var wss = new WebSocketServer({ server: server });
console.log("server launched.");

wss.on("connection", (ws) => {
  // heroku タイムアウト対策
  const id = setInterval(function () {
    ws.send(JSON.stringify(new Date()), function () {});
  }, 40000);

  // ip address を idとして扱う
  ws.clientId = ws._socket.remoteAddress.replace(/^.*:/g, "") + uuid.v4();
  clientConnections.push(ws);
  console.log(`client connection count: ${clientConnections.length}`);

  ws.on("message", (message) => {
    const json = JSON.parse(message);
    if (json.type == MessageType.JoinRoom) {
      const room = getRoomByClientId(ws.clientId);
      if (room && room.roomName === json.roomName) {
        console.log(`${json.name} is already joined Room 【${json.roomName}】`);
        return;
      }
      // 当該クライアントをルームから削除
      leaveRoom(ws.clientId);
      joinRoom(ws.clientId, json);
      sendMessageToClients(message);
    } else if (json.type == MessageType.SendMessage) {
      sendMessageToClientsInRoom(ws.clientId, message);
      console.log(`message from ${json.name} to Room 【${json.roomName}】`);
    } else if (json.type == MessageType.ListMember) {
      json.members = getMembers(json.roomName);
      sendMessageToClients(JSON.stringify(json), ws.clientId);
    } else if (json.type == MessageType.SendImage) {
      sendMessageToClientsInRoom(ws.clientId, message);
      console.log(`image from ${json.name} to Room 【${json.roomName}】`);
    } else if (json.type == MessageType.SendURL) {
      sendMessageToClientsInRoom(ws.clientId, message);
    }
  });

  ws.on("close", () => {
    clearInterval(id);
    // 当該クライアントをルームから削除
    leaveRoom(ws.clientId);
    removeFromConnections(ws.clientId);
    console.log(`${ws.clientId} connection is closed.`);
  });

  // ルーム情報をクライアントに通知
  const json = {
    type: MessageType.Connected,
    rooms: rooms,
  };
  const message = JSON.stringify(json);
  setTimeout(() => {
    // クライアントが受信できる状態に確実になってから送信
    // TODO 3秒は適当
    ws.send(message);
  }, 3000);
});

/**
 * クライアントをルームに追加
 * @param {*} clientId
 * @param {*} json
 *
 * @return クライアントが入ったルーム
 */
function joinRoom(clientId, json) {
  const room = rooms.find((room) => room.roomName == json.roomName);
  if (json.roomName && !room) {
    // ルームにまだ誰も入っていなければルームを作る
    rooms.push({
      roomName: json.roomName,
      clients: [
        {
          name: json.name,
          id: clientId,
        },
      ],
    });
    console.log(`${json.name} joins Room 【${json.roomName}】`);
  } else if (room.clients.findIndex((c) => c.id == clientId) != -1) {
    // 既に同じルームに入っていたら何もしない
    console.log(`${json.name} is already joined Room 【${json.roomName}】`);
    return;
  } else {
    // ルームが既にあればクライアントを追加
    room.clients.push({
      name: json.name,
      id: clientId,
    });
    console.log(`${json.name} joins Room 【${json.roomName}】`);
  }
}

/**
 * クライアントをルームから削除
 * @param {*} clientId
 */
function leaveRoom(clientId) {
  const room = getRoomByClientId(clientId);
  if (!room) {
    return;
  }

  const index = room.clients.findIndex((c) => c.id == clientId);
  if (index == -1) {
    return;
  }
  // 該当ルームからクライアントを退出
  room.clients.splice(index, 1);

  // クライアントがいなくなったルームは削除
  if (room.clients.length == 0) {
    const i = rooms.findIndex((r) => r.roomName == room.roomName);
    rooms.splice(i, 1);
  }
}

/**
 * クライアントが所属しているルームを取得
 * @param {*} clientId
 */
function getRoomByClientId(clientId) {
  const room = rooms.find((room) => {
    return room.clients.findIndex((c) => c.id == clientId) != -1;
  });

  return room;
}

/**
 * 送信元が属するルームにいるクライアントにメッセージを送る
 * @param {*} json
 */
function sendMessageToClientsInRoom(clientId, message) {
  const room = getRoomByClientId(clientId);

  // ルームに入っていなければ送らない
  if (!room) {
    console.log(`${clientId} is not joined any rooms.`);
    return;
  }

  clientConnections.forEach((connection) => {
    if (
      room.clients.findIndex((client) => client.id == connection.clientId) != -1
    ) {
      connection.send(message);
    }
  });
}

/**
 * クライアントにレスポンスを返す（クライアントが指定されていなければ全てのクライアント）
 * @param {*} message
 * @param {*} clientId
 */
function sendMessageToClients(message, clientId) {
  if (clientId) {
    const connection = clientConnections.find((c) => c.clientId == clientId);
    if (connection) {
      connection.send(message);
    }

    return;
  }
  clientConnections.forEach((connection) => {
    connection.send(message);
  });
}

/**
 * コネクションプールから当該クライアントコネクションを削除
 * @param {*} clientId
 */
function removeFromConnections(clientId) {
  const index = clientConnections.findIndex((c) => c.clientId == clientId);
  if (index == -1) {
    return;
  }
  clientConnections.splice(index, 1);
}

function getMembers(roomName) {
  const room = rooms.find((room) => room.roomName == roomName);
  if (room) {
    return room.clients;
  }
}

function notifyNewComer() {
  // const json = {
  //     rooms: {
  //         name: "",
  //         clients: []
  //     }
  // }
  // clientConnections.forEach(connection => {
  //     connection.send(message);
  // })
}
