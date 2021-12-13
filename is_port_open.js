
/*Based on rocky's answer on Stack Overflow:
https://stackoverflow.com/questions/29860354/in-nodejs-how-do-i-check-if-a-port-is-listening-or-in-use

and hexacyanide's answer on Stack Overflow:
https://stackoverflow.com/questions/19129570/how-can-i-check-if-port-is-busy-in-nodejs/35251815
*/

const net = require("net");
const log = require("./logger.js");
const { exec } = require("child_process");

module.exports = function(port)
{
	if (process.platform === "linux")
		return _sockuseScript(port);
	
	else return _netServerCheck(port);
};

function _sockuseScript(port)
{
	return new Promise((resolve, reject) =>
	{
		exec(`sh sockuse.sh ${port}`, (err, stdout, stderr) =>
		{
			log.test(log.getLeanLevel(), `sockuse.sh stdout output:\n\n\t<${stdout}>`);
			
			if (err != null)
				reject(err);
	
			else if (+stdout == 0)
			{
				// Socket not used, port is open, return true
				log.test(log.getLeanLevel(), `sockuse.sh port ${port} open!`);
				resolve(true);
			}
	
			else if (+stdout == 1)
			{
				// Socket used, port is in use, return false
				log.test(log.getLeanLevel(), `sockuse.sh port ${port} currently busy!`);
				resolve(false);
			}
	
			else reject(new Error("Unexpected sockuse output"));
		});
	});
}

function _netServerCheck(port)
{
	var wasPromiseResolved = false;
	var timeoutMs = 30000;

	//create a server on the same port to see if it is free
	//If an EADDRINUSE error code occurs, we know it's not free
	//If the server starts listening successfully, we know it's free
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
		// If server closed and promise wasn't resolved yet, this means the
		// port is available as our server managed to listen to it above
		server.on("close", function(err)
		{
			if (wasPromiseResolved === true)
				return;

			wasPromiseResolved = true;
			resolve(true);
		});

		// If error is EADDRINUSE then port is busy; otherwise it could not verify
		server.on("error", function(err)
		{
			if (wasPromiseResolved === true)
				return;

			wasPromiseResolved = true;
			server.close();

			if (err.code === "EADDRINUSE")
				resolve(false);

			else reject(new Error(`Could not verify status of port ${port}: ${err.message}`));
		});

		setTimeout(() =>
		{
			if (wasPromiseResolved === true)
				return;

			server.close();
			wasPromiseResolved = true;
			reject(new Error(`No response after ${timeoutMs}; could not determine whether port ${port} is available.`));

		}, timeoutMs);
	});
}