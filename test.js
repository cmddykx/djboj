const http = require('http');
const socketio = require('socket.io');
 
const server = http.createServer((req, res) => {
  if (req.url === '/count') {
    const count = Object.keys(io.sockets.sockets).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count }));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>在线人数</title></head>
      <body>
        <h2>当前在线人数：<span id="count">-</span></h2>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          const socket = io();
          socket.on('count', n => document.getElementById('count').textContent = n);
        </script>
      </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end();
  }
});
 
const io = socketio(server);
 
io.on('connection', socket => {
  io.emit('count', Object.keys(io.sockets.sockets).length);
  socket.on('disconnect', () => {
    io.emit('count', Object.keys(io.sockets.sockets).length);
  });
});
 
server.listen(3000, () => {
  console.log('运行在 http://127.0.0.1:3000');
});