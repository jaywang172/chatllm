#!/bin/bash

# Change directory to the script's directory
cd "$(dirname "$0")"

# Set a premium title for the terminal window
echo -ne "\033]0;DeepSeek V4 Pro Launcher\007"

# Clear the screen and show a gorgeous startup banner
clear
echo -e "\033[1;36m================================================================="
echo -e "       ____                 ____             _      __   __   _"
echo -e "      |  _ \\  ___  ___ _ __/ ___|  ___  ___ | | __  \\ \\ / /  / |"
echo -e "      | | | |/ _ \\/ _ \\ '_ \\___ \\ / _ \\/ _ \\| |/ /   \\ V /   | |"
echo -e "      | |_| |  __/  __/ |_) ___) |  __/  __/|   <     \\ /    | |"
echo -e "      |____/ \\___|\\___| .__/____/ \\___|\\___||_|\\_\\     V     |_|"
echo -e "                      |_|"
echo -e "                  NVIDIA NIM Platform Chat Client"
echo -e "=================================================================\033[0m"
echo ""
echo -e "\033[1;32m[Launcher] 正在開啟本地伺服器...\007"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo -e "\033[1;31m[Error] 未在系統中偵測到 Node.js，請先下載並安裝 Node.js！\033[0m"
    echo "請至官網下載安裝：https://nodejs.org"
    echo "按任意鍵退出..."
    read -n 1
    exit 1
fi

# Automatically open the browser after a short delay to let the server bind the port
(sleep 1 && open "http://localhost:3000") &

# Start the node server directly in the terminal so logs are visible
node server.js
