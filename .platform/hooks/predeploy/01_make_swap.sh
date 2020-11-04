#!/bin/bash

SWAPFILE=/var/swapfile
SWAP_BLOCKS=126
SWAP_BLOCK_MEGABYTES=128M

if [ -f $SWAPFILE ]; then
  # NO OUTPUT
#	echo "Swapfile $SWAPFILE found, assuming already setup"
	exit;
fi

#SWAP_BLOCKS * $SWAP_BLOCK_MEGABYTES = 10GB
/bin/dd if=/dev/zero of=$SWAPFILE bs=$SWAP_BLOCK_MEGABYTES count=$SWAP_BLOCKS
/bin/chmod 600 $SWAPFILE
/sbin/mkswap $SWAPFILE
/sbin/swapon $SWAPFILE
