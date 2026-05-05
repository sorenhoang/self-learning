---
title: "60 Linux Commands You Need to Know"
description: "A comprehensive reference guide to 60 essential Linux commands — from file navigation and user management to networking, processes, and system monitoring. Covers syntax, practical examples, and real-world usage patterns."
tags: ["Linux", "Command Line", "Terminal", "DevOps", "Sysadmin"]
date: "2026-05-05"
draft: false
---

# 60 Linux Commands You Need to Know

The Linux command line is one of the most powerful tools in a developer's or sysadmin's toolkit. Whether you're managing a remote server, automating tasks, or just navigating your local machine, fluency with the terminal opens up a level of control that no GUI can match.

This guide covers the 60 essential commands you need — not as a dry reference, but with real examples and the reasoning behind each one.

---

## Navigation

### `pwd`
Print Working Directory. Always know where you are.

```bash
pwd
# /home/alice/projects
```

### `ls`
List files and directories. Use flags to reveal more detail.

```bash
ls -la        # Long format with hidden files
ls -lh        # Human-readable file sizes
```

### `cd`
Change directory. The most-used command on any system.

```bash
cd /var/log        # Absolute path
cd ..              # Go up one level
cd ~               # Go to home directory
cd -               # Go back to previous directory
```

### `clear`
Clear the terminal screen. Or press `Ctrl+L`.

```bash
clear
```

### `exit`
Log out of the current session or close the terminal.

```bash
exit
```

### `history`
Show all previously entered commands. Pipe with `grep` to find a specific one.

```bash
history
history | grep ssh
```

---

## File and Directory Operations

### `touch`
Create a new empty file. Also updates the timestamp of an existing file.

```bash
touch notes.txt
touch index.html style.css app.js    # Create multiple at once
```

### `mkdir`
Make a new directory. Use `-p` to create nested paths in one command.

```bash
mkdir logs
mkdir -p projects/api/src             # Creates all parent dirs
```

### `cp`
Copy files or directories. Use `-r` for recursive (directories).

```bash
cp file.txt backup.txt
cp -r src/ dist/
```

### `rm`
Remove files or directories. **Irreversible — no recycle bin.**

```bash
rm old_file.txt
rm -rf build/         # Force-remove directory recursively — use with caution
```

### `rmdir`
Remove an **empty** directory. Safer than `rm -r` when you expect it to be empty.

```bash
rmdir empty_folder
```

### `ln`
Create hard or symbolic (soft) links. Symlinks are like shortcuts; hard links share the same inode.

```bash
ln -s /etc/nginx/nginx.conf nginx.conf    # Symlink
ln original.txt hardlink.txt              # Hard link
```

### `find`
Search for files in a directory tree by name, type, size, and more.

```bash
find / -name "*.log" -type f
find . -name "config.json"
find /var -mtime -7                       # Modified in the last 7 days
```

### `zip` / `unzip`
Compress and extract `.zip` archives.

```bash
zip archive.zip file1.txt file2.txt
zip -r project.zip project/               # Recursive
unzip archive.zip
unzip archive.zip -d /tmp/extracted/
```

### `shred`
Securely delete a file by overwriting it before removal. Use when data must not be recoverable.

```bash
shred -u -z secret.txt      # Overwrite, then remove
```

---

## Viewing and Editing Files

### `cat`
Print the full contents of a file to the terminal. Also useful for concatenating files.

```bash
cat /etc/hosts
cat file1.txt file2.txt > combined.txt
```

### `less`
View file content one page at a time. Press `q` to quit, `/` to search.

```bash
less /var/log/syslog
```

### `head` / `tail`
View the first or last N lines of a file. `tail -f` follows live updates — invaluable for log monitoring.

```bash
head -n 20 access.log
tail -n 50 error.log
tail -f /var/log/nginx/access.log     # Live stream
```

### `echo`
Print text to the terminal or write it to a file.

```bash
echo "Hello, World!"
echo "export PATH=$PATH:/usr/local/bin" >> ~/.bashrc
```

### `nano`
A beginner-friendly terminal text editor. Keyboard shortcuts are shown at the bottom.

```bash
nano config.yaml
```

### `vim`
A powerful modal editor. Steep learning curve, but extremely efficient once learned. Press `i` to enter insert mode, `Esc` to return to normal mode, `:wq` to save and quit.

```bash
vim script.sh
```

---

## Text Processing

### `grep`
Search for patterns in files using regular expressions. One of the most versatile commands available.

```bash
grep "error" /var/log/syslog
grep -r "TODO" ./src/                   # Recursive search
grep -n "function" app.js               # Show line numbers
grep -i "warning" log.txt               # Case-insensitive
```

### `awk`
A full pattern-scanning and text-processing language. Excellent for columnar data.

```bash
awk '{print $1}' access.log             # Print first column
awk -F: '{print $1}' /etc/passwd        # Custom field separator
awk '$3 > 1000 {print $1}' data.txt     # Conditional output
```

### `sort`
Sort lines of text alphabetically or numerically.

```bash
sort names.txt
sort -n numbers.txt                     # Numeric sort
sort -r file.txt                        # Reverse order
sort -u file.txt                        # Remove duplicates
```

### `cmp`
Compare two files byte-by-byte. Exits silently if files are identical.

```bash
cmp original.bin modified.bin
```

### `diff`
Show line-by-line differences between two text files.

```bash
diff old_config.txt new_config.txt
diff -u old.py new.py                   # Unified format (used in patches)
```

---

## User and Session Management

### `whoami`
Print the current logged-in username.

```bash
whoami
```

### `useradd`
Low-level command to create a new user account. Does not create a home directory by default.

```bash
useradd john
useradd -m -s /bin/bash john            # With home dir and shell
```

### `adduser`
Interactive, higher-level alternative to `useradd`. Prompts for password and details.

```bash
adduser alice
```

### `su`
Switch to another user account within the current terminal.

```bash
su alice
su -                                    # Switch to root with its environment
```

### `sudo`
Run a single command with superuser privileges without fully switching to root.

```bash
sudo apt update
sudo systemctl restart nginx
```

### `passwd`
Change the password for a user account.

```bash
passwd                     # Change your own password
sudo passwd alice          # Change another user's password
```

### `finger`
Display information about a user — login name, home directory, shell, and last login.

```bash
finger alice
```

---

## Package Management

### `apt`
The package manager for Debian and Ubuntu-based systems. Handles installation, updates, and removal.

```bash
sudo apt update                         # Refresh package index
sudo apt upgrade                        # Upgrade all installed packages
sudo apt install nginx                  # Install a package
sudo apt remove nginx                   # Remove a package
sudo apt search "text editor"           # Search for packages
```

---

## File Permissions

### `chmod`
Change file permissions. Use numeric (octal) or symbolic notation.

```bash
chmod 755 script.sh          # rwxr-xr-x
chmod +x deploy.sh           # Add execute permission
chmod -R 644 ./public/       # Recursive
```

Permission quick reference: `4` = read, `2` = write, `1` = execute. Owner / Group / Others.

### `chown`
Change the owner and/or group of a file.

```bash
chown alice file.txt
chown alice:developers file.txt
chown -R www-data:www-data /var/www/    # Recursive, common for web servers
```

---

## Networking

### `ssh`
Securely connect to a remote machine over the network. The backbone of remote server management.

```bash
ssh user@192.168.1.10
ssh -p 2222 user@server.com             # Custom port
ssh -i ~/.ssh/id_rsa user@server.com    # Specific key
```

### `curl`
Transfer data from a URL. Widely used for testing APIs and downloading files.

```bash
curl https://api.example.com/users
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"Alice"}' https://api.example.com/users
curl -O https://example.com/file.tar.gz  # Download file
```

### `ping`
Test network connectivity to a host by sending ICMP echo requests.

```bash
ping google.com
ping -c 4 192.168.1.1               # Send exactly 4 packets
```

### `ifconfig`
Display or configure network interfaces. Older tool — still widely found on systems.

```bash
ifconfig
ifconfig eth0
```

### `ip address`
The modern replacement for `ifconfig`. Part of the `iproute2` suite.

```bash
ip address show
ip addr                             # Short form
ip link show
```

### `resolvectl status`
Query and manage DNS resolution. Shows which DNS servers are in use per interface.

```bash
resolvectl status
```

### `netstat`
Display network connections, routing tables, and interface statistics.

```bash
netstat -tuln                       # TCP/UDP listening ports
netstat -an | grep ESTABLISHED
```

### `ss`
The modern, faster replacement for `netstat`. Same flags, better performance.

```bash
ss -tuln
ss -s                               # Summary statistics
```

### `iptables`
Configure the Linux kernel's packet filtering firewall. Powerful but complex.

```bash
sudo iptables -L                    # List all rules
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
```

### `ufw`
Uncomplicated Firewall — a user-friendly front-end for `iptables`.

```bash
sudo ufw enable
sudo ufw allow 22
sudo ufw allow 'Nginx HTTPS'
sudo ufw status verbose
```

---

## System Information

### `uname`
Print system information — kernel version, OS, architecture.

```bash
uname -a                            # All info
uname -r                            # Kernel release only
```

### `neofetch`
Display system info alongside a stylized ASCII art logo. Popular for screenshots.

```bash
neofetch
```

### `cal`
Display a calendar in the terminal.

```bash
cal                                 # Current month
cal 2026                            # Full year
cal 12 2026                         # Specific month and year
```

### `free`
Show RAM and swap memory usage.

```bash
free -h                             # Human-readable (GB/MB)
free -s 5                           # Refresh every 5 seconds
```

### `df`
Display disk space usage for all mounted file systems.

```bash
df -h                               # Human-readable
df -h /home                         # Specific mount point
```

### `man`
Open the manual page for any command. The most underused command by beginners.

```bash
man grep
man ssh
man 5 passwd                        # Section 5 (file formats)
```

### `whatis`
Print a one-line description of a command — useful when you can't remember what something does.

```bash
whatis chmod
whatis grep
```

---

## Process Management

### `ps`
Show a snapshot of currently running processes.

```bash
ps aux                              # All processes, detailed
ps aux | grep nginx                 # Find a specific process
```

### `top`
Real-time, dynamic view of running processes and resource usage. Press `q` to quit.

```bash
top
```

### `htop`
An interactive, colorful, more user-friendly version of `top`. Supports mouse input.

```bash
htop
```

### `kill`
Send a signal to a process by its PID. `SIGKILL` (9) forces immediate termination.

```bash
kill 1234
kill -9 1234                        # Force kill
kill -15 1234                       # Graceful termination (SIGTERM, default)
```

### `pkill`
Kill processes by name instead of PID.

```bash
pkill nginx
pkill -9 python
```

### `systemctl`
Control systemd services — the init system used by most modern Linux distributions.

```bash
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl status nginx
sudo systemctl enable nginx         # Start on boot
sudo systemctl disable nginx
```

---

## Power Management

### `reboot`
Restart the system immediately (or scheduled).

```bash
sudo reboot
```

### `shutdown`
Shut down or schedule a system shutdown.

```bash
sudo shutdown -h now                # Halt immediately
sudo shutdown -r +5                 # Reboot in 5 minutes
sudo shutdown -c                    # Cancel a scheduled shutdown
```

---

## Quick Reference Table

| Category | Commands |
|:--|:--|
| **Navigation** | `pwd`, `ls`, `cd`, `clear`, `exit`, `history` |
| **Files** | `touch`, `mkdir`, `cp`, `rm`, `rmdir`, `ln`, `find`, `zip`, `unzip`, `shred` |
| **Viewing / Editing** | `cat`, `less`, `head`, `tail`, `echo`, `nano`, `vim` |
| **Text Processing** | `grep`, `awk`, `sort`, `cmp`, `diff` |
| **Users** | `whoami`, `useradd`, `adduser`, `su`, `sudo`, `passwd`, `finger` |
| **Packages** | `apt` |
| **Permissions** | `chmod`, `chown` |
| **Networking** | `ssh`, `curl`, `ping`, `ifconfig`, `ip address`, `resolvectl`, `netstat`, `ss`, `iptables`, `ufw` |
| **System Info** | `uname`, `neofetch`, `cal`, `free`, `df`, `man`, `whatis` |
| **Processes** | `ps`, `top`, `htop`, `kill`, `pkill`, `systemctl` |
| **Power** | `reboot`, `shutdown` |

---

## Key Takeaways

- **Navigation basics** (`pwd`, `ls`, `cd`) are the foundation — know them cold.
- **`grep`, `awk`, and pipes** are where the terminal becomes genuinely powerful. Combine them freely.
- **`man` and `whatis`** are your built-in documentation — reach for them before searching the web.
- **`chmod` and `chown`** are essential for security. Understand what you're setting before running them.
- **`systemctl`** is how modern Linux manages services — learn `start`, `stop`, `enable`, and `status`.
- **`tail -f`** on log files is one of the most practical debugging habits you can build.
- The best way to retain these commands is to use them daily. Open a terminal, break things, and fix them.
