# !/bin/bash

# Check if the update_dom_script file exists; if not then manually create it.
# This script is fed to steamcmd, and asks it to login and install/update Dominions 6.
[ -f update_dom_script ] || echo '@ShutdownOnFailedCommand 1\n@NoPromptForPassword 1\nforce_install_dir /home/steam/Steam/Dominions6/\nlogin ClockworkHoundsForest\napp_update 2511500 validate\nquit' > update_dom_script

# Run the domupdate script configured on the server, and return 0 if successful
if [ "$('steamcmd +runscript /home/steam/update_dom_script')" = "0" ]; then
	echo "0"
else
	echo "1"
fi
