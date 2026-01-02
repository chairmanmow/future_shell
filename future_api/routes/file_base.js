/*
FileBase class
Class used for accessing file databases - introduced in v3.19

To create a new FileBase object: var filebase = new FileBase('code')
where code is a directory internal code.

FileBase methods
Name	Returns	Usage	Ver	Description
open	boolean	FileBase.open()	3.19	Open file base
close	boolean	FileBase.close()	3.19	Close file base (if open)
get	object	FileBase.get(string filename or object file-meta-object [,number detail=FileBase.DETAIL.NORM])	3.19	Get a file metadata object or null on failure. The file-meta-object may contain the following properties (depending on detail value):
name	Filename (required)
vpath	Virtual path to file READ ONLY
desc	Description (summary, 58 chars or less)
extdesc	Extended description (multi-line description, e.g. DIZ)
author	File author name (e.g. from SAUCE record)
author_org	File author organization (group, e.g. from SAUCE record)
from	Uploader's user name (e.g. for awarding credits)
from_ip_addr	Uploader's IP address (if available, for security tracking)
from_host_name	Uploader's host name (if available, for security tracking)
from_protocol	TCP/IP protocol used by uploader (if available, for security tracking)
from_port	TCP/UDP port number used by uploader (if available, for security tracking)
to_list	Comma-separated list of recipient user numbers (for user-to-user transfers)
tags	Space-separated list of tags
anon	true if the file was uploaded anonymously
size	File size, in bytes, at the time of upload
cost	File credit value (0=free)
time	File modification date/time (in time_t format)
added	Date/time file was uploaded/imported (in time_t format)
last_downloaded	Date/time file was last downloaded (in time_t format) or 0=never
times_downloaded	Total number of times file has been downloaded
crc16	16-bit CRC of file contents
crc32	32-bit CRC of file contents
md5	128-bit MD5 digest of file contents (hexadecimal)
sha1	160-bit SHA-1 digest of file contents (hexadecimal)
auxdata	File auxiliary information (JSON)
get_list	array	FileBase.get_list([string filespec] [,number detail=FileBase.DETAIL.NORM] [,number since-time=0] [,bool sort=true [,number order]])	3.19	Get a list (array) of file metadata objects, the default sort order is the sysop-configured order or FileBase.SORT.NAME_AI
get_name	string	FileBase.get_name(path/filename)	3.19	Return index-formatted (e.g. shortened) version of filename without path (file base does not have to be open)
get_names	array	FileBase.get_names([string filespec] [,number since-time=0] [,bool sort=true [,number order]])	3.19	Get a list of index-formatted (e.g. shortened) filenames (strings) from file base index, the default sort order is the sysop-configured order or FileBase.SORT.NAME_AI
get_path	string	FileBase.get_path(string filename or object file-meta-object)	3.19	Get the full path to the local file
get_size	number	FileBase.get_size(string filename or object file-meta-object)	3.19	Get the size of the local file, in bytes, or -1 if it does not exist
get_time	number	FileBase.get_time(string filename or object file-meta-object)	3.19	Get the modification date/time stamp of the local file
add	boolean	FileBase.add(object file-meta-object [,bool use_diz=true-if-no-extdesc] [,object client=none])	3.19	Add a file to the file base, returning true on success or false upon failure. Pass use_diz parameter as true or false to force or prevent the extraction/import of description file (e.g. FILE_ID.DIZ) within archive (e.g. ZIP) file.
remove	boolean	FileBase.remove(filename [,bool delete=false])	3.19	Remove an existing file from the file base and optionally delete file, may throw exception on errors (e.g. file remove failure)
update	boolean	FileBase.update(filename, object file-meta-object [,bool use_diz_always=false] [,bool readd_always=false])	3.19	Update metadata and/or rename an existing file in the file base, may throw exception on errors (e.g. file rename failure)
renew	boolean	FileBase.renew(filename)	3.19	Remove and re-add (as new) an existing file in the file base
hash	object	FileBase.hash(string filename_or_fullpath)	3.19	Calculate hashes of a file's contents (file base does not have to be open)
dump	array	FileBase.dump(filename)	3.19	Dump file header fields to an array of strings for diagnostic uses
format_name	string	FileBase.format_name(path/filename [,number size=12] [,bool pad=false])	3.19	Return formatted (e.g. shortened) version of filename without path (file base does not have to be open) for display

FileBase properties
Name	Type	Ver	Description
error	string	3.19	Last occurred file base error description - READ ONLY
status	number	3.19	Return value of last SMB Library function call - READ ONLY
file	string	3.19	Base path and filename of file base - READ ONLY
retry_time	number	3.19	File base open/lock retry timeout (in seconds)
retry_delay	number	3.19	Delay between file base open/lock retries (in milliseconds)
first_file	number	3.19	First file number - READ ONLY
last_file	number	3.19	Last file number - READ ONLY
last_file_time	number	3.19	Time-stamp of last file - READ ONLY
files	number	3.19	Total number of files - READ ONLY
update_time	number	3.19	Time-stamp of file base index (only writable when file base is closed)
max_files	number	3.19	Maximum number of files before expiration - READ ONLY
max_age	number	3.19	Maximum age (in days) of files to store - READ ONLY
attributes	number	3.19	File base attributes - READ ONLY
dirnum	number	3.19	Directory number (0-based, -1 if invalid) - READ ONLY
is_open	boolean	3.19	true if the file base has been opened successfully - READ ONLY
FileBase class object

FileBase.DETAIL object
Detail level numeric constants (in increasing verbosity)

FileBase.DETAIL properties
Name	Type	Description
MIN	number	Include indexed-filenames only
NORM	number	Normal level of file detail (e.g. full filenames, minimal metadata)
EXTENDED	number	Normal level of file detail plus extended descriptions
AUXDATA	number	Normal level of file detail plus extended descriptions and auxiliary data (JSON format)
MAX	number	Maximum file detail, include undefined/null property values
FileBase.SORT object
Sort order numeric constants

FileBase.SORT properties
Name	Type	Description
NATURAL	number	Natural/index order (no sorting)
NAME_AI	number	Filename ascending, case insensitive sort order
NAME_DI	number	Filename descending, case insensitive sort order
NAME_AS	number	Filename ascending, case sensitive sort order
NAME_DS	number	Filename descending, case sensitive sort order
DATE_A	number	Import date/time ascending sort order
DATE_D	number	Import date/time descending sort order
SIZE_A	number	File size in bytes, ascending sort order
SIZE_D	number	File size in bytes, descending sort order
*/