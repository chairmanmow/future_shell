/*
user object
Instance of User class, representing current user online - introduced in v3.10

To create a new user object: var u = new User; or: var u = new User(number);

user methods
Name	Returns	Usage	Ver	Description
compare_ars	boolean	user.compare_ars(requirements)	3.10	Verify and return true if user meets the specified access requirements string.true when passed null, undefined, or an empty string.
Note: For the current user of the terminal server, use bbs.compare_ars() instead.
adjust_credits	boolean	user.adjust_credits(count)	3.14	Adjust user's credits by count (negative to subtract).
adjust_minutes	boolean	user.adjust_minutes(count)	3.14	Adjust user's extra minutes count (negative to subtract).
posted_message	boolean	user.posted_message([count])	3.14	Adjust user's posted-messages statistics by count (default: 1) (negative to subtract).
sent_email	boolean	user.sent_email([count] [,bool feedback])	3.14	Adjust user's email/feedback-sent statistics by count (default: 1) (negative to subtract).
uploaded_file	boolean	user.uploaded_file([bytes] [,files])	3.14	Adjust user's files/bytes-uploaded statistics.
downloaded_file	boolean	user.downloaded_file([dir-code] [file path | name] [bytes] [,file-count])	3.18	Handle the full or partial successful download of a file.
Adjust user's files/bytes-downloaded statistics and credits, file's stats, system's stats, and uploader's stats and credits.
get_time_left	number	user.get_time_left(start_time)	3.14b	Return the user's available remaining time online, in seconds, based on the passed start_time value (in time_t format).
Note: this method does not account for pending forced timed events.
Note: for the pre-defined user object on the BBS, you almost certainly want bbs.get_time_left() instead.
close	void	user.close()	3.19c	Close the user.tab file, if open. The file will be automatically reopened if necessary.

user properties
Name	Type	Ver	Description
number	number	3.10	Record number (1-based)
alias	string	3.10	Alias/name
name	string	3.10	Real name
handle	string	3.10	Chat handle
lang	string	3.20	Language code (blank, if default, e.g. English)
note	string	3.10	Sysop note
ip_address	string	3.10	IP address last logged-in from
host_name	string	3.10	Host name last logged-in from (AKA computer)
comment	string	3.10	Sysop's comment
netmail	string	3.10	External e-mail address
email	string	3.10	Local Internet e-mail address - READ ONLY
address	string	3.10	Street address
location	string	3.10	Location (e.g. city, state)
zipcode	string	3.10	Zip/postal code
phone	string	3.10	Phone number
birthdate	string	3.10	Birth date in 'YYYYMMDD' format or legacy format: 'MM/DD/YY' or 'DD/MM/YY', depending on system configuration
birthyear	number	3.18c	Birth year
birthmonth	number	3.18c	Birth month (1-12)
birthday	number	3.18c	Birth day of month (1-31)
age	number	3.10	Calculated age in years - READ ONLY
connection	string	3.10	Connection type (protocol, AKA modem)
screen_rows	number	3.10	Terminal rows (0 = auto-detect)
screen_columns	number	3.18c	Terminal columns (0 = auto-detect)
gender	string	3.10	Gender type (e.g. M or F or any single-character)
cursub	string	3.10	Current/last message sub-board (internal code)
curdir	string	3.10	Current/last file directory (internal code)
curxtrn	string	3.10	Current/last external program (internal code) run
editor	string	3.10	External message editor (internal code) or blank if none
command_shell	string	3.10	Command shell (internal code)
settings	number	3.10	Settings bit-flags - see USER_* in sbbsdefs.js for bit definitions
qwk_settings	number	3.10	QWK packet settings bit-flags - see QWK_* in sbbsdefs.js for bit definitions
chat_settings	number	3.10	Chat settings bit-flags - see CHAT_* in sbbsdefs.js for bit definitions
mail_settings	number	3.20	Mail settings bit-flags - see MAIL_* in sbbsdefs.js for bit definitions
temp_file_ext	string	3.10	Temporary file type (extension)
new_file_time	number	3.11	New file scan date/time (time_t format)
download_protocol	string	3.10	File transfer protocol (command key)
logontime	number	3.10	Logon time (time_t format)
cached	boolean	3.14	Record is currently cached in memory
is_sysop	boolean	3.15	User has a System Operator's security level
batch_upload_list	string	3.20	Batch upload list file path/name
batch_download_list	string	3.20	Batch download list file path/name

user.stats object
User statistics (all READ ONLY) - introduced in v3.10

user.stats properties
Name	Type	Ver	Description
laston_date	number	3.10	Date of previous logon (time_t format)
firston_date	number	3.10	Date of first logon (time_t format)
total_logons	number	3.10	Total number of logons
logons_today	number	3.10	Total logons today
total_timeon	number	3.10	Total time used (in minutes)
timeon_today	number	3.10	Time used today (in minutes)
timeon_last_logon	number	3.10	Time used last session (in minutes)
total_posts	number	3.10	Total messages posted
total_emails	number	3.10	Total e-mails sent
total_feedbacks	number	3.10	Total feedback messages sent
email_today	number	3.10	E-mail sent today
posts_today	number	3.10	Messages posted today
bytes_uploaded	number	3.10	Total bytes uploaded
files_uploaded	number	3.10	Total files uploaded
bytes_downloaded	number	3.10	Total bytes downloaded
files_downloaded	number	3.10	Total files downloaded
download_cps	number	3.20	Latest average download rate, in characters (bytes) per second
leech_attempts	number	3.10	Suspected leech downloads
mail_waiting	number	3.12	Total number of e-mail messages currently waiting in inbox
read_mail_waiting	number	3.18c	Number of read e-mail messages currently waiting in inbox
unread_mail_waiting	number	3.18c	Number of unread e-mail messages currently waiting in inbox
spam_waiting	number	3.18c	Number of SPAM e-mail messages currently waiting in inbox
mail_pending	number	3.12	Number of e-mail messages sent, currently pending deletion

user.limits object
User limitations based on security level (all READ ONLY) - introduced in v3.11

user.limits properties
Name	Type	Ver	Description
time_per_logon	number	3.11	Time (in minutes) per logon
time_per_day	number	3.11	Time (in minutes) per day
logons_per_day	number	3.11	Logons per day
lines_per_message	number	3.11	Lines per message (post or email)
email_per_day	number	3.11	Email sent per day
posts_per_day	number	3.11	Messages posted per day
free_credits_per_day	number	3.11	Free credits given per day
*/