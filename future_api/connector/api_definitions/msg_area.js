/*
msg_area object
Message Areas - introduced in v3.10

msg_area properties
Name	Type	Description
settings	number	Message area settings (bit-flags) - see MM_* in sbbsdefs.js for details
fido_netmail_settings	number	FidoNet NetMail settings (bit-flags) - see NMAIL_* in sbbsdefs.js for details
inet_netmail_settings	number	Internet NetMail settings (bit-flags) - see NMAIL_* in sbbsdefs.js for details
msg_area.grp object
Associative array of all groups (use name as index) - introduced in v3.12

msg_area.sub object
Associative array of all sub-boards (use internal code as index) - introduced in v3.11

msg_area.grp_list array
Message Groups (current user has access to) - introduced in v3.10

msg_area.grp_list properties
Name	Type	Description
index	number	Index into grp_list array (or -1 if not in array)
number	number	Unique (zero-based) number for this message group
name	string	Group name
description	string	Group description
ars	string	Group access requirements
can_access	boolean	User has sufficient access to list this group's sub-boards
code_prefix	string	Internal code prefix (for sub-boards)
msg_area.grp_list.sub_list array
Message Sub-boards (current user has access to)

(all properties are READ ONLY except for scan_ptr, scan_cfg, and last_read) - introduced in v3.10
msg_area.grp_list.sub_list properties
Name	Type	Description
index	number	Index into sub_list array (or -1 if not in array)
grp_index	number	Group's index into grp_list array
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
can_access	boolean	User has sufficient access to see this sub-board
can_read	boolean	User has sufficient access to read messages in this sub-board
can_post	boolean	User has sufficient access to post messages in this sub-board
is_operator	boolean	User has operator access to this sub-board
is_moderated	boolean	User's posts are moderated
scan_ptr	undefined	User's current new message scan pointer (highest-read message number)
scan_cfg	undefined	User's message scan configuration (bit-flags) - see SCAN_CFG_* in sbbsdefs.js for details
last_read	undefined	User's last-read message number
posts	number	Number of messages currently posted to this sub-board
*/