#!/bin/bash

set -e

# First cd to script directory
cd "$(dirname "$0")"

PLUGIN_DIR="../../plugins/photoshop"
if [ ! -f "$PLUGIN_DIR/manifest.json" ]; then
    echo "Missing Photoshop UXP manifest: $PLUGIN_DIR/manifest.json" >&2
    exit 1
fi

# 进入 plugins/photoshop 目录打包文件
cd "$PLUGIN_DIR" && zip -r ../../static/sd-ppp_PS.zip ./*

# 重命名 .zip 为 .ccx
cd ../../static && rm -f sd-ppp_PS.ccx && mv sd-ppp_PS.zip sd-ppp_PS.ccx
