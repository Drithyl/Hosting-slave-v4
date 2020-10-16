#!/bin/bash

gamename=$1

kill $(ps ax|grep $gamename|grep -v grep|awk '{print $1}')

#by pencils, 2019
