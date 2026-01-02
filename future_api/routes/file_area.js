/*
file_area object
File Transfer Areas - introduced in v3.10

file_area properties
Name	Type	Description
min_diskspace	number	Minimum amount of available disk space (in bytes) required for user uploads to be allowed
max_filename_length	number	Maximum allowed length of filenames (in characters) uploaded by users
settings	number	File area settings (bit-flags) - see FM_* in sbbsdefs.js for details
web_vpath_prefix	string	Web file virtual path prefix
file_area.lib object
Associative array of all libraries (use name as index) - introduced in v3.12

file_area.dir object
Associative array of all directories (use internal code as index) - introduced in v3.11

file_area.lib_list array
File Transfer Libraries (current user has access to) - introduced in v3.10

file_area.lib_list properties
Name	Type	Description
index	number	Index into lib_list array (or -1 if not in array)
number	number	Unique (zero-based) number for this library
name	string	Name
description	string	Description
ars	string	Access requirements
vdir	string	Virtual directory name (for FTP or Web access)
can_access	boolean	User has sufficient access to this library's directories
code_prefix	string	Internal code prefix (for directories)
file_area.lib_list.dir_list array
File Transfer Directories (current user has access to) - introduced in v3.10

file_area.lib_list.dir_list properties
Name	Type	Description
index	number	Index into dir_list array (or -1 if not in array)
number	number	Unique (zero-based) number for this directory
lib_index	number	Library index
lib_number	number	Library number
lib_name	string	Library name
code	string	Directory internal code
name	string	Directory name
description	string	Directory description
area_tag	string	Directory area tag for file echoes
path	string	Directory file storage location
ars	string	Directory access requirements
upload_ars	string	Directory upload requirements
download_ars	string	Directory download requirements
exempt_ars	string	Directory exemption requirements
operator_ars	string	Directory operator requirements
extensions	string	Allowed file extensions (comma delimited)
upload_sem	string	Upload semaphore file
data_dir	string	Directory data storage location
settings	number	Toggle options (bit-flags)
seqdev	number	Sequential (slow storage) device number
sort	number	Sort order (see FileBase.SORT for valid values)
max_files	number	Configured maximum number of files
max_age	number	Configured maximum age (in days) of files before expiration
upload_credit_pct	number	Percent of file size awarded uploader in credits upon file upload
download_credit_pct	number	Percent of file size awarded uploader in credits upon subsequent downloads
vdir	string	Virtual directory name (for FTP or Web access)
vpath	string	Virtual path (for FTP or Web access), with trailing slash
files	number	Virtual shortcut (for FTP or Web access), optional
update_time	number	Number of files currently in this directory
can_access	boolean	Time-stamp of file base index of this directory
can_upload	boolean	User has sufficient access to view this directory (e.g. list files)
can_download	boolean	User has sufficient access to upload files to this directory
is_exempt	boolean	User has sufficient access to download files from this directory
is_operator	boolean	User is exempt from download credit costs (or the directory is configured for free downloads)
vshortcut	string	User has operator access to this directory
is_offline	boolean	Directory is for off-line storage
is_upload	boolean	Directory is for uploads only
is_sysop	boolean	Directory is for uploads to sysop only
*/