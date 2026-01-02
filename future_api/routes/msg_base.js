/*
MsgBase class
Class used for accessing message bases - introduced in v3.10

To create a new MsgBase object: var msgbase = new MsgBase('code')
where code is a sub-board internal code, or mail for the e-mail message base.

The MsgBase retrieval methods that accept a by_offset argument as their optional first boolean argument will interpret the following number argument as either a 1-based unique message number (by_offset=false) or a 0-based message index-offset (by_offset=true). Retrieving messages by offset is faster than by number or message-id (string). Passing an existing message header object to the retrieval methods that support it (e.g. get_msg_body()) is even faster.

MsgBase methods
Name	Returns	Usage	Ver	Description
open	boolean	MsgBase.open()	3.10	Open message base
close	boolean	MsgBase.close()	3.10	Close message base (if open)
get_msg_header	object	MsgBase.get_msg_header([bool by_offset=false,] number number_or_offset or string id [,bool expand_fields=true] [,bool include_votes=false])	3.12	Return a specific message header, null on failure.
Pass false for the expand_fields argument (default: true) if you will be re-writing the header later with put_msg_header()
Additional read-only header properties: mime_version, content_type, and is_utf8
get_all_msg_headers	object	MsgBase.get_all_msg_headers([bool include_votes=false] [,bool expand_fields=true])	3.16	Return an object (associative array) of all message headers "indexed" by message number.
Message headers returned by this function include additional properties: upvotes, downvotes and total_votes.
Vote messages are excluded by default.
put_msg_header	boolean	MsgBase.put_msg_header([bool by_offset=false,] [number number_or_offset or string id,] object header)	3.10	Modify an existing message header (must have been 'got' without expanded fields)
get_msg_body	string	MsgBase.get_msg_body([bool by_offset=false,] number number_or_offset or string id or object header [,bool strip_ctrl_a=false] [,bool dot_stuffing=false] [,bool include_tails=true] [,bool plain_text=false])	3.10	Return the entire body text of a specific message as a single string or null on failure.
The default behavior is to leave Ctrl-A codes intact, do not stuff dots (e.g. per RFC-821), and to include tails (if any) in the returned body text.
When plain_text is true, only the first plain-text portion of a multi-part MIME encoded message body is returned.
The first argument (following the optional by_offset boolean) must be either a number (message number or index-offset), string (message-ID), or object (message header).
The by_offset (true) argument should only be passed when the argument following it is the numeric index-offset of the message to be retrieved.
By default (by_offset=false), a numeric argument would be interpreted as the message number to be retrieved.
After reading a multi-part MIME-encoded message, new header properties may be available: text_charset and text_subtype.
get_msg_tail	string	MsgBase.get_msg_tail([bool by_offset=false,] number number_or_offset or string id or object header [,bool strip_ctrl_a=false])	3.10	Return the tail text of a specific message, null on failure
get_msg_index	object	MsgBase.get_msg_index([bool by_offset=false,] number number_or_offset, [bool include_votes=false])	3.11	Return a specific message index record, null on failure.
The index object will contain the following properties:
attr	Attribute bit-flags
time	Date/time imported (in time_t format)
number	Message number
offset	Record number in index file

Indexes of regular messages will contain the following additional properties:
subject	CRC-16 of lowercase message subject
to	CRC-16 of lowercase recipient's name (or user number if e-mail)
from	CRC-16 of lowercase sender's name (or user number if e-mail)

Indexes of vote messages will contain the following additional properties:
vote	vote value
remsg	number of message this vote is in response to
get_index	array	MsgBase.get_index()	3.17c	Return an array of message index records represented as objects, the same format as returned by get_msg_index()
This is the fastest method of obtaining a list of all message index records.
remove_msg	boolean	MsgBase.remove_msg([bool by_offset=false,] number number_or_offset or string id)	3.11	Mark message for deletion
save_msg	boolean	MsgBase.save_msg(object header [,object client=none] [,body_text=""] [,array rcpt_list=none])	3.12	Create a new message in message base.
The header object may contain the following properties:
subject	Message subject (required)
to	Recipient's name (required)
to_ext	Recipient's user number (for local e-mail)
to_org	Recipient's organization
to_net_type	Recipient's network type (default: 0 for local)
to_net_addr	Recipient's network address
to_agent	Recipient's agent type
to_list	Comma-separated list of primary recipients, RFC822-style
cc_list	Comma-separated list of secondary recipients, RFC822-style
from	Sender's name (required)
from_ext	Sender's user number
from_org	Sender's organization
from_net_type	Sender's network type (default: 0 for local)
from_net_addr	Sender's network address
from_agent	Sender's agent type
from_ip_addr	Sender's IP address (if available, for security tracking)
from_host_name	Sender's host name (if available, for security tracking)
from_protocol	TCP/IP protocol used by sender (if available, for security tracking)
from_port	TCP/UDP port number used by sender (if available, for security tracking)
sender_userid	Sender's user ID (if available, for security tracking)
sender_server	Server's host name (if available, for security tracking)
sender_time	Time/Date message was received from sender (if available, for security tracking)
replyto	Replies should be sent to this name
replyto_ext	Replies should be sent to this user number
replyto_org	Replies should be sent to organization
replyto_net_type	Replies should be sent to this network type
replyto_net_addr	Replies should be sent to this network address
replyto_agent	Replies should be sent to this agent type
replyto_list	Comma-separated list of mailboxes to reply-to, RFC822-style
mime_version	MIME Version (optional)
content_type	MIME Content-Type (optional)
summary	Message Summary (optional)
editor	Message Editor used by author (optional)
tags	Message Tags (space-delimited, optional)
id	Message's RFC-822 compliant Message-ID
reply_id	Message's RFC-822 compliant Reply-ID
reverse_path	Message's SMTP sender address
forward_path	Argument to SMTP 'RCPT TO' command
path	Messages's NNTP path
newsgroups	Message's NNTP newsgroups header
ftn_msgid	FidoNet FTS-9 Message-ID
ftn_reply	FidoNet FTS-9 Reply-ID
ftn_area	FidoNet FTS-4 echomail AREA tag
ftn_flags	FidoNet FSC-53 FLAGS
ftn_pid	FidoNet FSC-46 Program Identifier
ftn_tid	FidoNet FSC-46 Tosser Identifier
ftn_charset	FidoNet FTS-5003 Character Set Identifier
date	RFC-822 formatted date/time
attr	Attribute bit-flags
auxattr	Auxiliary attribute bit-flags
netattr	Network attribute bit-flags
when_written_time	Date/time (in time_t format)
when_written_zone	Time zone (in SMB format)
when_written_zone_offset	Time zone in minutes east of UTC
when_imported_time	Date/time message was imported
when_imported_zone	Time zone (in SMB format)
when_imported_zone_offset	Time zone in minutes east of UTC
thread_id	Thread identifier (originating message number)
thread_back	Message number that this message is a reply to
thread_next	Message number of the next reply to the original message in this thread
thread_first	Message number of the first reply to this message
votes	Bit-field of votes if ballot, maximum allowed votes per ballot if poll
priority	Priority value following the X-Priority email header schcme (1 = highest, 3 = normal, 5 = lowest, 0 = unspecified)
delivery_attempts	Number of failed delivery attempts (e.g. over SMTP)
field_list[].type	Other SMB header fields (type)
field_list[].data	Other SMB header fields (data)
can_read	true if the current user can read this validated or unmoderated message

The optional client argument is an instance of the Client class to be used for the security log header fields (e.g. sender IP address, hostname, protocol, and port). The global client object will be used if this parameter is omitted.

The optional rcpt_list is an array of objects that specifies multiple recipients for a single message (e.g. bulk e-mail). Each recipient object in the array may include the following header properties (described above):
to, to_ext, to_org, to_net_type, to_net_addr, and to_agent

vote_msg	boolean	MsgBase.vote_msg(object header)	3.17	Create a new vote in message base.
The header object should contain the following properties:
from	Sender's name (required)
from_ext	Sender's user number (if applicable)
from_net_type	Sender's network type (default: 0 for local)
from_net_addr	Sender's network address
reply_id	The Reply-ID of the message being voted on (or specify thread_back)
thread_back	Message number of the message being voted on
attr	Should be either MSG_UPVOTE, MSG_DOWNVOTE, or MSG_VOTE (if answer to poll)
add_poll	boolean	MsgBase.add_poll(object header)	3.17	Create a new poll in message base.
The header object should contain the following properties:
subject	Polling question (required)
from	Sender's name (required)
from_ext	Sender's user number (if applicable)
from_net_type	Sender's network type (default: 0 for local)
from_net_addr	Sender's network address
close_poll	boolean	MsgBase.close_poll(message number, user name or alias)	3.17	Close an existing poll
how_user_voted	number	MsgBase.how_user_voted(message number, user name or alias)	3.17	Return 0 for no votes, 1 for an up-vote, 2 for a down-vote, or in the case of a poll-response: a bit-field of votes.
dump_msg_header	array	MsgBase.dump_msg_header(object header)	3.17c	Dump a message header object to an array of strings for diagnostic uses

MsgBase properties
Name	Type	Ver	Description
error	string	3.10	Last occurred message base error - READ ONLY
status	number	3.12	Return value of last SMB Library function call - READ ONLY
file	string	3.10	Base path and filename of message base - READ ONLY
retry_time	number	3.10	Message base open/lock retry timeout (in seconds)
retry_delay	number	3.11	Delay between message base open/lock retries (in milliseconds)
first_msg	number	3.10	First message number - READ ONLY
last_msg	number	3.10	Last message number - READ ONLY
total_msgs	number	3.10	Total number of messages - READ ONLY
max_crcs	number	3.10	Maximum number of message CRCs to store (for dupe checking) - READ ONLY
max_msgs	number	3.10	Maximum number of messages before expiration - READ ONLY
max_age	number	3.10	Maximum age (in days) of messages to store - READ ONLY
attributes	number	3.10	Message base attributes - READ ONLY
subnum	number	3.10	Sub-board number (0-based, 65535 for e-mail) - READ ONLY
is_open	boolean	3.10	true if the message base has been opened successfully - READ ONLY
MsgBase.cfg object
Configuration parameters for this message area (sub-boards only) - READ ONLY - introduced in v3.10

MsgBase.cfg properties
Name	Type	Description
index	undefined	Index into sub_list array (or -1 if not in array)
grp_index	undefined	Group's index into grp_list array
number	number	Unique (zero-based) number for this sub-board
grp_number	number	Group number
grp_name	string	Group name
code	string	Sub-board internal code
name	string	Sub-board name
description	string	Sub-board description
qwk_name	string	QWK conference name
area_tag	string	Area tag for FidoNet-style echoes, a.k.a. EchoTag
newsgroup	string	Newsgroup name (as configured or dynamically generated)
ars	string	Sub-board access requirements
read_ars	string	Sub-board reading requirements
post_ars	string	Sub-board posting requirements
operator_ars	string	Sub-board operator requirements
moderated_ars	string	Sub-board moderated-user requirements (if non-blank)
data_dir	string	Sub-board data storage location
fidonet_addr	string	FidoNet node address
fidonet_origin	string	FidoNet origin line
qwknet_tagline	string	QWK Network tagline
settings	number	Toggle options (bit-flags) - see SUB_* in sbbsdefs.js for details
ptridx	number	Index into message scan configuration/pointer file
qwk_conf	number	QWK conference number
max_crcs	number	Configured maximum number of message CRCs to store (for dupe checking)
max_msgs	number	Configured maximum number of messages before purging
max_age	number	Configured maximum age (in days) of messages before expiration
print_mode	number	Additional print mode flags to use when printing messages - see P_* in sbbsdefs.js for details
print_mode_neg	number	Print mode flags to negate when printing messages - see P_* in sbbsdefs.js for details
MsgBase class object

MsgBase.IndexPrototype object
Prototype for all index objects. Can be used to extend these objects. - introduced in v3.17

MsgBase.HeaderPrototype object
Prototype for all header objects. Can be used to extend these objects. - introduced in v3.17
*/