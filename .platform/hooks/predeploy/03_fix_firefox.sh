#!/bin/bash
cd /var/app/current/node_modules/playwright-firefox/.local-browsers/firefox-1188
sudo rm -rf firefox
sudo wget -O firefox.tar.bz2 "https://download.mozilla.org/?product=firefox-82.0&os=linux64&lang=en-US"
sudo tar xvf firefox*

