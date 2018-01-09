#!/bin/bash

sudo docker build -t gospeltoolbox/website:latest /site

mkdir -p /build
sudo docker save gospeltoolbox/website:latest > /site/build/gospeltoolbox-website.tar