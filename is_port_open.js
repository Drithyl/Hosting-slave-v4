
/*Based on rocky's answer on Stack Overflow:
https://stackoverflow.com/questions/29860354/in-nodejs-how-do-i-check-if-a-port-is-listening-or-in-use

and hexacyanide's answer on Stack Overflow:
https://stackoverflow.com/questions/19129570/how-can-i-check-if-port-is-busy-in-nodejs/35251815
*/

const log = require("./logger.js");
const { exec } = require("child_process");
const tcpPortUsed = require("tcp-port-used");

module.exports = async function(port)
{
	if (process.platform === "linux")
		return _sockuseScript(port);
	
	// Use npm module to check ports on Windows
	const isPortInUse = await tcpPortUsed.check(port, "localhost");
	return isPortInUse === false;
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