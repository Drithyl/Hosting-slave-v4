# !/bin/bash

port=$1

# -atn will NOT resolve some ports to service names
# with just -at, some relevant ports will not be parsable
# as they will appear as a name. For example, a dom process
# might show as 0.0.0.0:cslistener, instead of 0.0.0.0:9000
if [ $(ss -atn|grep -c $port) = '0' ]; then
	echo "0"
else
	echo "1"
fi

# by pencils, 2021
# modified by Drithyl to use ss -atn instead of ss -at, 2021
