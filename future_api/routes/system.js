/*
system object
Global system-related properties and methods - introduced in v3.10

system methods
Name	Returns	Usage	Ver	Description
username	string	system.username(user_number)	3.11	Return name of user in specified user record number, or empty string if not found
alias	string	system.alias(alias)	3.10	Return name of user that matches alias (if found in ctrl/alias.cfg)
find_login_id	number	system.find_login_id(user-id)	3.20	Find a user's login ID (alias, real name, or number), returns matching user record number or 0 if not found
matchuser	number	system.matchuser(username [,sysop_alias=true])	3.10	Exact user name matching, returns number of user whose name/alias matches username or 0 if not found, matches well-known sysop aliases by default
matchuserdata	number	system.matchuserdata(field, data [,bool match_del=false] [,number usernumber, bool match_next=false])	3.10	Search user database for data in a specific field (see U_* in sbbsdefs.js).
If match_del is true, deleted user records are searched, returns first matching user record number, optional usernumber specifies user record to skip, or record at which to begin searching if optional match_next is true.
trashcan	boolean	system.trashcan(basename, find_string)	3.10	Search text/basename.can for pseudo-regexp
findstr	boolean	system.findstr(path/filename or array of strings, find_string)	3.10	Search any trashcan/filter file or array of pattern strings (in *.can format) for find_string
zonestr	string	system.zonestr([timezone=local])	3.10	Convert time zone integer to string, defaults to system timezone if timezone not specified
timestr	string	system.timestr([time=current])	3.10	Convert time_t integer into a time string, defaults to current time if time not specified
datestr	string	system.datestr([time=current])	3.10	Convert time_t integer into a short (8 character) date string, in either numeric or verbal format (depending on system preference), defaults to current date if time not specified. If time is a string in numeric date format, returns the parsed time_t value as a number.
secondstr	string	system.secondstr(seconds)	3.10	Convert elapsed time in seconds into a string in hh:mm:ss format
spamlog	boolean	system.spamlog([protocol, action, reason, host, ip, to, from])	3.10	Log a suspected SPAM attempt
hacklog	boolean	system.hacklog([protocol, user, text, host, ip, port])	3.10	Log a suspected hack attempt
filter_ip	boolean	system.filter_ip([protocol, reason, host, ip, username, filename] [number duration-in-seconds])	3.11	Add an IP address (with comment) to an IP filter file. If filename is not specified, the ip.can file is used
get_node	object	system.get_node(node_number)	3.17c	Read a node data record all at once (and leaving the record unlocked) returning an object matching the elements of system.node_list
get_node_message	string	system.get_node_message(node_number)	3.11	Read any messages waiting for the specified node and return in a single string or null if none are waiting
put_node_message	boolean	system.put_node_message(node_number, message_text)	3.10	Send a node a short text message, delivered immediately
get_telegram	string	system.get_telegram(user_number)	3.11	Return any short text messages waiting for the specified user or null if none are waiting
put_telegram	boolean	system.put_telegram(user_number, message_text)	3.10	Send a user a short text message, delivered immediately or during next logon
notify	boolean	system.notify(user_number, subject [,message_text])	3.18b	Notify a user or operator via both email and a short text message about an important event
new_user	object	system.new_user(name/alias [,client object])	3.10	Create a new user record, returns a new User object representing the new user account, on success.
returns a numeric error code on failure
del_user	boolean	system.del_user(user_number)	3.16	Delete the specified user account
exec	number	system.exec(command-line)	3.11	Execute a native system/shell command-line, returns 0 on success
popen	array	system.popen(command-line)	3.11	Execute a native system/shell command-line, returns array of captured output lines on success (only functional on UNIX systems)
check_syspass	boolean	system.check_syspass(password)	3.11	Compare the supplied password against the system password and returns true if it matches
check_name	boolean	system.check_name(name/alias)	3.15	Check that the provided name/alias string is suitable for a new user account, returns true if it is valid
check_filename	boolean	system.check_filename(filename)	3.19c	Verify that the specified filename string is legal and allowed for upload by users (based on system configuration and filter files), returns true if the filename is allowed
allowed_filename	boolean	system.allowed_filename(filename)	3.19c	Verify that the specified filename string is allowed for upload by users (based on system configuration), returns true if the filename is allowed
safest_filename	boolean	system.safest_filename(filename)	3.19c	Verify that the specified filename string contains only the safest subset of characters
illegal_filename	boolean	system.illegal_filename(filename)	3.19c	Check if the specified filename string contains illegal characters or sequences, returns true if it is an illegal filename
check_pid	boolean	system.check_pid(process-ID)	3.15	Check that the provided process ID is a valid executing process on the system, returns true if it is valid
terminate_pid	boolean	system.terminate_pid(process-ID)	3.15	Terminate executing process on the system with the specified process ID, returns true on success
text	string	system.text(number index or string id)	3.18c	Return specified text string (see bbs.text() for details) or null if invalid index or id specified.
The string id support was added in v3.20.

system properties
Name	Type	Ver	Description
name	string	3.10	BBS name
operator	string	3.10	Operator name
operator_available	boolean	3.18b	Operator is available for chat
guru	string	3.20	Default Guru (AI) name
qwk_id	string	3.10	System QWK-ID (for QWK packets)
settings	number	3.10	Settings bit-flags (see SYS_* in sbbsdefs.js for bit definitions)
login_settings	number	3.20	Login control settings bit-flags (see LOGIN_* in sbbsdefs.js for bit definitions)
inet_addr	string	3.11	Internet address (host or domain name)
location	string	3.10	Location (city, state)
timezone	number	3.10	Local timezone in SMB format (use system.zonestr() to get string representation)
tz_offset	number	3.20	Local timezone offset, in minutes, from UTC (negative values represent zones west of UTC, positive values represent zones east of UTC)
date_format	number	3.20c	Date representation (0=Month first, 1=Day first, 2=Year first
date_separator	string	3.20c	Short (8 character) date field-separator
date_verbal	boolean	3.20c	Short date month-name displayed verbally instead of numerically
birthdate_format	string	3.20c	User birth date input and display format (MM=Month number, DD=Day of month, YYYY=Year)
birthdate_template	string	3.20c	User birth date input template
pwdays	number	3.10	Days between forced user password changes (0=never)
min_password_length	number	3.17c	Minimum number of characters in user passwords
max_password_length	number	3.17c	Maximum number of characters in user passwords
deldays	number	3.10	Days to preserve deleted user records, record will not be reused/overwritten during this period
autodel	number	3.17c	Days of user inactivity before auto-deletion (0=disabled), N/A to P-exempt users
last_user	number	3.11	Last user record number in user database (includes deleted and inactive user records)
last_useron	string	3.10	Name of last user to logoff
freediskspace	number	3.10	Amount of free disk space (in bytes)
freediskspacek	number	3.10	Amount of free disk space (in kibibytes)
nodes	number	3.10	Total number of Terminal Server nodes
last_node	number	3.10	Last displayable node number
mqtt_enabled	boolean	3.20	MQTT support (connection to MQTT broker) is enabled
newuser_password	string	3.10	New user password (NUP, optional)
newuser_magic_word	string	3.10	New user magic word (optional)
newuser_level	number	3.10	New user security level
newuser_flags1	number	3.10	New user flag set #1
newuser_flags2	number	3.10	New user flag set #2
newuser_flags3	number	3.10	New user flag set #3
newuser_flags4	number	3.10	New user flag set #4
newuser_restrictions	number	3.10	New user restriction flags
newuser_exemptions	number	3.10	New user exemption flags
newuser_credits	number	3.10	New user credits
newuser_minutes	number	3.10	New user extra minutes
newuser_command_shell	string	3.10	New user default command shell
newuser_editor	string	3.10	New user default external editor
newuser_settings	number	3.10	New user default settings
newuser_download_protocol	string	3.10	New user default file transfer protocol (command key)
newuser_expiration_days	number	3.10	New user expiration days
newuser_questions	number	3.10	New user questions/prompts (see UQ_* in sbbsdefs.js for bit definitions)
expired_level	number	3.10	Expired user security level
expired_flags1	number	3.10	Expired user flag set #1
expired_flags2	number	3.10	Expired user flag set #2
expired_flags3	number	3.10	Expired user flag set #3
expired_flags4	number	3.10	Expired user flag set #4
expired_restrictions	number	3.10	Expired user restriction flags
expired_exemptions	number	3.10	Expired user exemption flags
node_dir	string	3.10	Current node directory
ctrl_dir	string	3.10	Control file directory
data_dir	string	3.10	Data file directory
text_dir	string	3.10	Text file directory
temp_dir	string	3.10	Temporary file directory
exec_dir	string	3.10	Executable file directory
mods_dir	string	3.10	Modified modules directory (optional)
logs_dir	string	3.10	Log file directory
devnull	string	3.11	Platform-specific "null" device filename
temp_path	string	3.12	Platform-specific temporary file directory
cmd_shell	string	3.14	Platform-specific command processor/shell
clock_ticks	number	3.11	Amount of elapsed time in clock 'ticks'
clock_ticks_per_second	number	3.11	Number of clock ticks per second
timer	number	3.14	High-resolution timer, in seconds (fractional seconds supported)
local_host_name	string	3.11	Private host name that uniquely identifies this system on the local network
name_servers	object	3.18c	Array of nameservers in use by the system
host_name	string	N/A	Public host name that uniquely identifies this system on the Internet (usually the same as system.inet_addr)
socket_lib	string	N/A	Socket library version information
uptime	number	N/A	Time/date system was brought online (in time_t format)
full_version	string	N/A	Synchronet full version information (e.g. '3.10k Beta Debug')
git_branch	string	N/A	Date and time compiled
git_hash	string	N/A	Synchronet version number (e.g. '3.10')
git_date	string	N/A	Synchronet revision letter (e.g. 'k')
compiled_when	string	N/A	Synchronet alpha/beta designation (e.g. ' beta')
version	string	N/A	Synchronet version notice (includes version and platform)
revision	string	N/A	Synchronet version number in decimal (e.g. 31301 for v3.13b)
beta_version	string	N/A	Synchronet version number in hexadecimal (e.g. 0x31301 for v3.13b)
version_notice	string	N/A	Synchronet Git repository branch name
version_num	number	N/A	Synchronet Git repository commit hash
version_hex	number	N/A	Synchronet Git repository commit date/time
git_time	number	N/A	Synchronet Git repository commit date/time (seconds since Unix epoch)
platform	string	N/A	Platform description (e.g. 'Win32', 'Linux', 'FreeBSD')
architecture	string	N/A	Architecture description (e.g. 'i386', 'i686', 'x86_64')
msgbase_lib	string	N/A	Message base library version information
compiled_with	string	N/A	Compiler used to build Synchronet
copyright	string	N/A	Synchronet copyright display
js_version	string	N/A	JavaScript engine version information
os_version	string	N/A	Operating system version information
fido_addr_list	object	N/A	Array of FidoNet Technology Network (FTN) addresses associated with this system
system.stats object
System statistics - introduced in v3.10

system.stats properties
Name	Type	Ver	Description
total_logons	number	3.10	Total logons
logons_today	number	3.10	Logons today
total_timeon	number	3.10	Total time used
timeon_today	number	3.10	Time used today
total_files	number	3.10	Total files in file bases
files_uploaded_today	number	3.10	Files uploaded today
bytes_uploaded_today	number	3.10	Bytes uploaded today
files_downloaded_today	number	3.10	Files downloaded today
bytes_downloaded_today	number	3.10	Bytes downloaded today
total_messages	number	3.10	Total messages in message bases
messages_posted_today	number	3.10	Messages posted today
total_email	number	3.10	Total messages in mail base
email_sent_today	number	3.10	Email sent today
total_feedback	number	3.10	Total feedback messages waiting
feedback_sent_today	number	3.10	Feedback sent today
total_users	number	3.10	Total user records (does not include deleted or inactive user records)
new_users_today	number	3.10	New users today
system.node_list array
Terminal Server node listing - introduced in v3.10

system.node_list properties
Name	Type	Ver	Description
status	number	3.10	Status (see nodedefs.js for valid values)
vstatus	string	3.20	Verbal status - READ ONLY
errors	number	3.10	Error counter
action	number	3.10	Current user action (see nodedefs.js)
activity	string	3.20	Current user activity - READ ONLYy
useron	number	3.10	Current user number
connection	number	3.10	Connection speed (0xffff = Telnet or RLogin)
misc	number	3.10	Miscellaneous bit-flags (see nodedefs.js)
aux	number	3.10	Auxiliary value
extaux	number	3.10	Extended auxiliary value
dir	string	3.15	Node directory - READ ONLY
*/