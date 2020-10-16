
/*Based on rocky's answer on Stack Overflow:
https://stackoverflow.com/questions/29860354/in-nodejs-how-do-i-check-if-a-port-is-listening-or-in-use

and hexacyanide's answer on Stack Overflow:
https://stackoverflow.com/questions/19129570/how-can-i-check-if-port-is-busy-in-nodejs/35251815
*/

const rw = require("./reader_writer.js");
const net = require('net');

module.exports = function(port)
{
  var wasPromiseResolved = false;
  var timeoutMs = 30000;

  //create a server on the same port to see if it is free
  //If an error occurs we know it's not free
  var server = net.createServer((socket) =>
  {
    socket.write("Echo server\r\n");
    socket.pipe(socket);
  });

  server.listen(port, "127.0.0.1");

  server.on("listening", function(err)
  {
    //server could listen on port so it's free, close server and wait
    //for the close event to fire below to make sure port gets freed up
    server.close();
  });

  return new Promise((resolve) =>
  {
    //An error, likely EADDRINUSE, so port is either being used still, or could not verify
    server.on("error", function(err)
    {
      if (wasPromiseResolved === false)
        server.close();
    });

    server.on("close", function(err)
    {
      if (wasPromiseResolved === false)
      {
        console.log("Port not in use.");
        wasPromiseResolved = true;
        resolve(false);
      }
        
    });

    setTimeout(() =>
    {
      if (wasPromiseResolved === false)
      {
        server.close();
        rw.log("error", `Server listening on port ${port} did not get an answer after ${timeoutMs}ms.`);
        wasPromiseResolved = true;
        resolve(true);
      }
    }, timeoutMs);
  });
};
