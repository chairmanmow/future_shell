/*
bbs object
Controls the Terminal Server (traditional BBS) experience - introduced in v3.10

bbs methods
Name	Returns	Usage	Ver	Description
atcode	string	bbs.atcode(code_string)	3.10	Return @-code value, specified code string does not include @ character delimiters.
expand_atcodes	string	bbs.expand_atcodes(string [,object msg_header])	3.20	Return string with @-code expanded values (some formatting and @-codes are not supported), using optional msg_header for MSG_* codes.
text	string	bbs.text(number index or string id [,bool default_text=false])	3.10	Return current text string (specified via 1-based string index number or identifier string) from text.dat, text.ini or replacement text or null upon error
New in v3.20:
Passing string identifier (id) for fast/cached look-up of text string by ID.
Use bbs.text.ID to obtain a text string index number from its corresponding ID (name).
The default_text argument can be used to get a default language (i.e. text.dat file) string value.

replace_text	boolean	bbs.replace_text(number index or string id, text)	3.10	Replace specified text.dat or text.ini string in memory.
revert_text	boolean	bbs.revert_text([number index or string id])	3.10	Revert specified text string to original text.dat or text.ini string; if index and id are unspecified, reverts all text strings.
load_text	boolean	bbs.load_text(filename)	3.10	Load alternate text strings (in text.dat or text.ini format) from a file in the ctrl directory.A .dat extension is automatically added to the filename if no extension was specified.
Note: text.ini support added to this method in v3.20c.
load_user_text	boolean	bbs.load_user_text()	3.20	Load text strings from the user's selected language (ctrl/text.*.ini) file.
newuser	void	bbs.newuser()	3.10	Initiate interactive new user registration procedure.
login	boolean	bbs.login(user_name [,password_prompt] [,user_password] [,system_password])	3.10	Login with user_name, displaying password_prompt for user's password (if required), optionally supplying the user's password and the system password as arguments so as to not be prompted.
logon	boolean	bbs.logon()	3.10	Initiate interactive user-logon procedure.
logoff	boolean	bbs.logoff([prompt=true])	3.15	Initiate interactive user-logoff procedure, pass false for prompt argument to avoid yes/no prompt, returns false if denied logoff, hangs-up (disconnects) upon completion of logoff.
logout	void	bbs.logout()	3.10	Initiate non-interactive user-logout procedure, invoked implicitly upon user-disconnect. Only invoke this method to force a logout without a disconnect.
hangup	void	bbs.hangup()	3.10	Hang-up (disconnect) the connected user/client immediately.
nodesync	void	bbs.nodesync([clear-line=false])	3.10	Synchronize with node database, checks for messages, interruption, etc. (AKA node_sync), clears the current console line if there's a message to print when clear-line is true.
auto_msg	void	bbs.auto_msg()	3.10	Read/create system's auto-message.
time_bank	void	bbs.time_bank()	3.10	Enter the time banking system.
qwk_sec	void	bbs.qwk_sec()	3.10	Enter the QWK message packet upload/download/config section.
text_sec	void	bbs.text_sec()	3.10	Enter the text files section.
xtrn_sec	void	bbs.xtrn_sec([section])	3.10	Enter the external programs section (or go directly to the specified section).
chat_sec	void	bbs.chat_sec()	3.20	Enter the chat section/menu.
xfer_policy	void	bbs.xfer_policy()	3.10	Display the file transfer policy.
xfer_prot_menu	string	bbs.xfer_prot_menu([bool upload=false] [,bool batch=false])	3.20	Display file transfer protocol menu, returns protocol command keys.
batch_menu	void	bbs.batch_menu()	3.10	Enter the batch file transfer menu.
batch_download	boolean	bbs.batch_download()	3.10	Start a batch download.
batch_add_list	void	bbs.batch_add_list(list_filename)	3.10	Add file list to batch download queue.
batch_sort	boolean	bbs.batch_sort([upload_queue=false])	3.20	Sort the batch download or batch upload queue.
batch_clear	boolean	bbs.batch_clear([upload_queue=false])	3.20	Clear the batch download or batch upload queue.
batch_remove	number	bbs.batch_remove(bool upload_queue, string filename_or_pattern or number index)	3.20	Remove one or more files from the batch download or batch upload queue.
view_file	boolean	bbs.view_file(filename)	3.19	List contents of specified filename (complete path).
send_file	boolean	bbs.send_file(filename [,protocol] [,description] [,autohang=true])	3.14	Send specified filename (complete path) to user via user-prompted (or optionally specified) protocol.
The optional description string is used for logging purposes.
When autohang is true, disconnect after transfer based on user's default setting.
receive_file	boolean	bbs.receive_file(filename [,protocol] [,autohang=true])	3.14	Received specified filename (complete path) from user via user-prompted (or optionally specified) protocol.
When autohang is true, disconnect after transfer based on user's default setting.
temp_xfer	void	bbs.temp_xfer()	3.10	Enter the temporary file tranfer menu.
user_sync	void	bbs.user_sync()	3.10	Read the current user data from the database.
user_config	void	bbs.user_config()	3.10	Enter the user settings configuration menu.
sys_info	void	bbs.sys_info()	3.10	Display system information.
sub_info	void	bbs.sub_info([sub-board=current])	3.10	Display message sub-board information (current sub-board, if unspecified).
dir_info	void	bbs.dir_info([directory=current])	3.10	Display file directory information (current directory, if unspecified).
user_info	void	bbs.user_info()	3.10	Display current user information.
ver	void	bbs.ver()	3.10	Display software version information.
sys_stats	void	bbs.sys_stats()	3.10	Display system statistics.
node_stats	void	bbs.node_stats([number node=current])	3.10	Display current (or specified) node statistics.
list_users	void	bbs.list_users([mode=UL_ALL])	3.10	Display user list(see UL_* in sbbsdefs.js for valid mode values).
edit_user	void	bbs.edit_user([number user=current])	3.10	Enter the user editor.
change_user	void	bbs.change_user()	3.10	Change to a different user.
list_logons	void	bbs.list_logons([arguments])	3.10	Display the logon list (optionally passing arguments to the logon list module).
read_mail	number	bbs.read_mail([number which=MAIL_YOUR] [,number user=current] [,number loadmail_mode=0])	3.10	Read private e-mail(see MAIL_* in sbbsdefs.js for valid which values), returns user-modified loadmail_mode value.
email	boolean	bbs.email(number to_user [,number mode=WM_EMAIL] [,string top=none] [,string subject=none] [,object reply_header])	3.10	Send private e-mail to a local user.
netmail	boolean	bbs.netmail([string address or array of addresses] [,number mode=WM_NONE] [,string subject=none] [,object reply_header])	3.10	Send private netmail.
bulk_mail	void	bbs.bulk_mail([ars])	3.10	Send bulk private e-mail, if ars not specified, prompt for destination users.
upload_file	boolean	bbs.upload_file([directory=current] [,string filename=undefined])	3.10	Upload file to file directory specified by number or internal code.
Will prompt for filename when none is passed.
batch_upload	boolean	bbs.batch_upload()	3.20	Start a batch upload of one or more files.
The user's batch upload queue must have one or more files or an 'Uploads' directory must be configured (file_area.upload_dir is not undefined).
Returns true if one or more blind-uploads were received and all files in the batch upload queue (if any) were received successfully.
bulk_upload	boolean	bbs.bulk_upload([directory=current])	3.10	Add files (already in local storage path) to file directory specified by number or internal code.
export_filelist	number	bbs.export_filelist(filename [,number mode=FL_NONE])	3.19	Export list of files to a text file, optionally specifying a file list mode (e.g. FL_ULTIME), returning the number of files listed.
list_files	number	bbs.list_files([directory=current] [,string filespec="*.*" or search_string] [,number mode=FL_NONE])	3.10	List files in the specified file directory, optionally specifying a file specification (wildcards) or a description search string, and mode (bit-flags).
list_file_info	number	bbs.list_file_info([directory=current] [,string filespec="*.*"] [,number mode=FI_INFO])	3.10	List extended file information for files in the specified file directory.
post_msg	boolean	bbs.post_msg([sub-board=current] [,number mode=WM_NONE] [,object reply_header])	3.13	Post a message in the specified message sub-board (number or internal code) with optional mode (bit-flags)
If reply_header is specified (a header object returned from MsgBase.get_msg_header()), that header will be used for the in-reply-to header fields.
forward_msg	boolean	bbs.forward_msg(object header, string to [,string subject] [,string comment])	3.18c	Forward a message.
edit_msg	boolean	bbs.edit_msg(object header)	3.18c	Edit a message.
show_msg	boolean	bbs.show_msg(object header [,number mode=P_NONE] )	3.17c	Show a message's header and body (text) with optional print mode (bit-flags)
header must be a header object returned from MsgBase.get_msg_header()).
show_msg_header	void	bbs.show_msg_header(object header [,string subject] [,string from] [,string to])	3.17c	Show a message's header (only)
header must be a header object returned from MsgBase.get_msg_header()).
download_msg_attachments	void	bbs.download_msg_attachments(object header)	3.17c	Prompt the user to download each of the message's file attachments (if there are any)
header must be a header object returned from MsgBase.get_msg_header()).
change_msg_attr	number	bbs.change_msg_attr(object header)	3.17c	Prompt the user to modify the specified message header attributes.
cfg_msg_scan	void	bbs.cfg_msg_scan([number type=SCAN_CFG_NEW])	3.10	Configure message scan (type is either SCAN_CFG_NEW or SCAN_CFG_TOYOU).
cfg_msg_ptrs	void	bbs.cfg_msg_ptrs()	3.10	Change message scan pointer values.
reinit_msg_ptrs	void	bbs.reinit_msg_ptrs()	3.10	Re-initialize new message scan pointers to values at logon.
save_msg_scan	void	bbs.save_msg_scan()	3.20	Save message scan configuration and pointers to userbase.
reload_msg_scan	void	bbs.reload_msg_scan()	3.20	Re-load message scan configuration and pointers from userbase.
scan_subs	void	bbs.scan_subs([number mode=SCAN_NEW] [,bool all=false])	3.10	Scan sub-boards for messages.
scan_dirs	void	bbs.scan_dirs([number mode=FL_NONE] [,bool all=false])	3.10	Scan directories for files.
scan_msgs	boolean	bbs.scan_msgs([sub-board=current] [,number mode=SCAN_READ] [,string find])	3.10	Scan messages in the specified message sub-board (number or internal code), optionally search for 'find' string (AKA scan_posts).
list_msgs	number	bbs.list_msgs([sub-board=current] [,number mode=SCAN_INDEX] [,number message_number=0] [,string find])	3.14	List messages in the specified message sub-board (number or internal code), optionally search for 'find' string, returns number of messages listed.
menu	boolean	bbs.menu(base_filename [,number mode=P_NONE] [,object scope])	3.10	Display a menu file from the text/menu directory.
See P_* in sbbsdefs.js for mode flags.
When scope is specified, @JS:property@ codes will expand the referenced property names.
To display a randomly-chosen menu file, including wild-card (* or ?) characters in the base_filename.
menu_exists	boolean	bbs.menu_exists(base_filename)	3.17	Return true if the referenced menu file exists (i.e. in the text/menu directory).
log_key	boolean	bbs.log_key(key [,comma=false])	3.10	Log key to node.log (comma optional).
log_str	boolean	bbs.log_str(text)	3.10	Log string to node.log.
finduser	number	bbs.finduser(username_or_number)	3.10	Find user name (partial name support), interactive.
trashcan	boolean	bbs.trashcan(base_filename, search_string)	3.10	Search file for pseudo-regexp (search string) in trashcan file (text/base_filename.can).
exec	number	bbs.exec(cmdline [,number mode=EX_NONE] [,string startup_dir])	3.10	Execute a program, optionally changing current directory to startup_dir (see EX_* in sbbsdefs.js for valid mode flags.)
exec_xtrn	boolean	bbs.exec_xtrn(xtrn_number_or_code)	3.10	Execute external program by number or internal code.
user_event	boolean	bbs.user_event(event_type)	3.10	Execute user event by event type (see EVENT_* in sbbsdefs.js for valid values).
telnet_gate	boolean	bbs.telnet_gate(address[:port] [,number mode=TG_NONE] [,number timeout=10] [,array send_strings])	3.10	External Telnet gateway (see TG_* in sbbsdefs.js for valid mode flags).
rlogin_gate	boolean	bbs.rlogin_gate(address[:port] [,string client-user-name=user.alias, string server-user-name=user.name, string terminal=console.terminal] [,number mode=TG_NONE] [,number timeout=10] [,array send_strings])	3.16	External RLogin gateway (see TG_* in sbbsdefs.js for valid mode flags).
check_filename	boolean	bbs.check_filename(filename)	3.19c	Verify that the specified filename string is legal and allowed for upload (based on system configuration), returns true if the filename is allowed.
Note: Will display text/badfile.msg for matching filenames, if it exists.
check_syspass	boolean	bbs.check_syspass([sys_pw])	3.10	Verify system password, prompting for the password if not passed as an argument.
good_password	boolean	bbs.good_password(password, [forced_unique=false])	3.10	Check if requested user password meets minimum password requirements (length, uniqueness, etc.).
When forced_unique is true, the password must be substantially different from the user's current password.
page_sysop	boolean	bbs.page_sysop()	3.10	Page the sysop for chat, returns false if the sysop could not be paged.
page_guru	boolean	bbs.page_guru()	3.10	Page the guru for chat.
multinode_chat	void	bbs.multinode_chat([number channel=1])	3.10	Enter multi-node chat.
private_message	void	bbs.private_message()	3.10	Use the private inter-node message promp.t
private_chat	void	bbs.private_chat([local=false])	3.10	Enter private inter-node chat, or local sysop chat (if local=true).
get_node_message	void	bbs.get_node_message([bool clear-line=false])	3.10	Receive and display an inter-node message.
put_node_message	boolean	bbs.put_node_message([number node_number] [,text])	3.17	Send an inter-node message (specify a node_number value of -1 for 'all active nodes').
get_telegram	void	bbs.get_telegram([number user_number=current], [bool clear-line=false])	3.10	Receive and display waiting telegrams for specified (or current) user.
put_telegram	boolean	bbs.put_telegram([number user_number] [,text])	3.17	Send a telegram (short multi-line stored message) to a useri.
list_nodes	void	bbs.list_nodes()	3.10	List all nodes.
whos_online	void	bbs.whos_online()	3.10	List active nodes only (who's online).
spy	void	bbs.spy(number node)	3.10	Spy on a node.
cmdstr	string	bbs.cmdstr(command_string [,string fpath=""] [,string fspec=""])	3.10	Return expanded command string using Synchronet command-line specifiers.
get_filespec	string	bbs.get_filespec()	3.10	Return a file specification input by the user (optionally with wildcards).
get_newscantime	number	bbs.get_newscantime([number time=current])	3.10	Confirm or change a new-scan time, returns the new new-scan time value (time_t format).
select_shell	boolean	bbs.select_shell()	3.10	Prompt user to select a new command shell.
select_editor	boolean	bbs.select_editor()	3.10	Prompt user to select a new external message editor.
get_time_left	number	bbs.get_time_left()	3.14b	Check the user's available remaining time online and return the value, in seconds.
This method will inform (and disconnect) the user when they are out of time.
compare_ars	boolean	bbs.compare_ars(requirements)	3.15	Verify and return true if the current user online meets the specified access requirements string.
Always returns true when passed null, undefined, or an empty string.
select_node	number	bbs.select_node(bool all_is_an_option=false)	3.17	Choose an active node to interact with.
Returns the selected node number, 0 (for none) or -1 for 'All'.
select_user	number	bbs.select_user()	3.17	Choose a user to interact with.
bbs.mods object
Global repository for 3rd party modifications - introduced in v3.12


bbs properties
Name	Type	Ver	Description
sys_status	number	3.10	System status bit-flags (see SS_* in sbbsdefs.js for bit definitions)
startup_options	number	3.10	Startup options bit-flags (see BBS_OPT_* in sbbsdefs.js for bit definitions)
answer_time	number	3.10	Answer time, in time_t format
logon_time	number	3.10	Logon time, in time_t format
start_time	number	3.14	Time from which user's time left is calculated, in time_t format
new_file_time	number	3.10	Current file new-scan time, in time_t format
last_new_file_time	number	3.10	Previous file new-scan time, in time_t format
online	number	3.10	Online (see ON_* in sbbsdefs.js for valid values)
time_left	number	3.11	Time left (in seconds)
event_time	number	3.11	Time of next exclusive event (in time_t format), or 0 if none
event_code	string	3.11	Internal code of next exclusive event
first_node	number	3.20	First node number (of this instance of Synchronet)
last_node	number	3.20	Last node number (of this instance of Synchronet)
node_num	number	3.10	Current node number
node_settings	number	3.10	Current node settings bit-flags (see NM_* in sbbsdefs.js for bit definitions)
node_status	number	3.17	Current node status value (see nodedefs.js for valid values)
node_errors	number	3.17	Current node error counter
node_action	number	3.10	Current node action (see nodedefs.js for valid values)
node_useron	number	3.17	Current node user number (useron value)
node_connection	number	3.17	Current node connection type (see nodedefs.js for valid values)
node_misc	number	3.17	Current node misc value (see nodedefs.js for valid values)
node_aux	number	3.17	Current node aux value
node_extaux	number	3.17	Current node extended aux (extaux) value
node_val_user	number	3.10	Validation feedback user for this node (or 0 for no validation feedback required)
logon_ulb	number	3.10	Bytes uploaded during this session
logon_dlb	number	3.10	Bytes downloaded during this session
logon_uls	number	3.10	Files uploaded during this session
logon_dls	number	3.10	Files downloaded during this session
logon_posts	number	3.10	Messages posted during this session
logon_emails	number	3.10	E-mails sent during this session
logon_fbacks	number	3.10	Feedback messages sent during this session
posts_read	number	3.10	Messages read during this session
menu_dir	string	3.10	Menu subdirectory (overrides default)
menu_file	string	3.10	Menu file (overrides default)
main_cmds	number	3.10	Total main menu commands received from user during this session
file_cmds	number	3.10	Total file menu commands received from user during this session
curgrp	number	3.10	Current message group
cursub	number	3.10	Current message sub-board
cursub_code	string	3.14	Current message sub-board internal code
curlib	number	3.10	Current file library
curdir	number	3.10	Current file directory
curdir_code	string	3.14	Current file directory internal code
connection	string	3.10	Remote connection type
rlogin_name	string	3.10	Login name given during RLogin negotiation
rlogin_password	string	3.15	Password specified during RLogin negotiation
rlogin_terminal	string	3.16	Terminal specified during RLogin negotiation
client_name	string	3.10	Client name
errorlevel	number	3.12	Error level returned from last executed external program
smb_group	string	3.10	Message group name of message being read
smb_group_desc	string	3.10	Message group description of message being read
smb_group_number	number	3.10	Message group number of message being read
smb_sub	string	3.10	Sub-board name of message being read
smb_sub_desc	string	3.10	Sub-board description of message being read
smb_sub_code	string	3.10	Sub-board internal code of message being read
smb_sub_number	number	3.10	Sub-board number of message being read
smb_attr	number	3.10	Message base attributes
smb_last_msg	number	3.10	Highest message number in message base
smb_total_msgs	number	3.10	Total number of messages in message base
smb_msgs	number	3.10	Number of messages loaded from message base
smb_curmsg	number	3.10	Current message number in message base
msg_to	string	3.10	Message recipient name
msg_to_ext	string	3.10	Message recipient extension
msg_to_net	string	3.10	Message recipient network address
msg_to_agent	number	3.10	Message recipient agent type
msg_from	string	3.10	Message sender name
msg_from_ext	string	3.10	Message sender extension
msg_from_net	string	3.10	Message sender network address
msg_from_bbsid	string	3.18c	Message sender BBS ID
msg_from_agent	number	3.10	Message sender agent type
msg_replyto	string	3.10	Message reply-to name
msg_replyto_ext	string	3.10	Message reply-to extension
msg_replyto_net	string	3.10	Message reply-to network address
msg_replyto_agent	number	3.10	Message reply-to agent type
msg_subject	string	3.10	Message subject
msg_date	number	3.10	Message date/time
msg_timezone	number	3.10	Message time zone
msg_date_imported	number	3.10	Message date/time imported
msg_attr	number	3.10	Message attributes
msg_auxattr	number	3.10	Message auxiliary attributes
msg_netattr	number	3.10	Message network attributes
msg_offset	number	3.10	Message header offset
msg_number	number	3.10	Message number (unique, monotonically incrementing)
msg_expiration	number	3.10	Message expiration
msg_forwarded	number	3.10	Message forwarded
msg_thread_id	number	3.16	Message thread identifier (0 if unknown)
msg_thread_back	number	3.12	Message thread, back message number
msg_thread_next	number	3.10	Message thread, next message number
msg_thread_first	number	3.10	Message thread, message number of first reply to this message
msg_id	string	3.10	Message identifier
msg_reply_id	string	3.10	Message replied-to identifier
msg_delivery_attempts	number	3.10	Message delivery attempt counter
msghdr_top_of_screen	number	3.17c	Message header displayed at top-of-screen
file_name	string	3.17	File name
file_description	string	3.17	File description
file_dir_number	string	3.17	File directory (number)
file_attr	string	3.17	File attribute flags
file_date	string	3.17	File date
file_size	string	3.17	File size (in bytes)
file_credits	string	3.17	File credit value
file_uploader	string	3.17	File uploader (user name)
file_upload_date	string	3.17	File upload date
file_download_date	string	3.17	File last-download date
file_download_count	string	3.17	File download count
download_cps	number	3.20	Most recent file download rate (in characters/bytes per second)
batch_upload_total	number	3.10	Number of files in batch upload queue
batch_dnload_total	number	3.10	Number of files in batch download queue
command_str	string	3.14	Current command shell/module command string value
*/