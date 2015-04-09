#!/bin/bash

sudo docker build -t gospeltoolbox/website:latest /docker/gospeltoolbox/website

mkdir -p /docker/build
sudo docker save gospeltoolbox/website:latest > /docker/build/gospeltoolbox-website.tar