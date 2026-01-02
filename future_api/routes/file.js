/*
File class
Class used for opening, creating, reading, or writing files on the local file system
Special features include:


Exclusive-access files (default) or shared files
optional record-locking
buffered or non-buffered I/O
Support for binary files
native or network byte order (endian)
automatic Unix-to-Unix (UUE), yEncode (yEnc) or Base64 encoding/decoding
Support for ASCII text files
supports line-based I/O
entire file may be read or written as an array of strings
individual lines may be read or written one line at a time
supports fixed-length records
optional end-of-text (etx) character for automatic record padding/termination
Synchronet .dat files use an etx value of 3 (Ctrl-C)
supports .ini formatted configuration files
Dynamically-calculated industry standard checksums (e.g. CRC-16, CRC-32, MD5)
- introduced in v3.10
To create a new File object: var f = new File(filename)

File methods
Name	Returns	Usage	Ver	Description
open	boolean	File.open([string mode="w+"] [,bool shareable=false] [,number buffer_length])	3.10	Open file, shareable defaults to false, buffer_length defaults to 2048 bytes, mode (default: 'w+') specifies the type of access requested for the file, as follows:
r  open for reading; if the file does not exist or cannot be found, the open call fails
w  open an empty file for writing; if the given file exists, its contents are destroyed
a  open for writing at the end of the file (appending); creates the file first if it doesn't exist
r+ open for both reading and writing (the file must exist)
w+ open an empty file for both reading and writing; if the given file exists, its contents are destroyed
a+ open for reading and appending
b  open in binary (untranslated) mode; translations involving carriage-return and linefeed characters are suppressed (e.g. r+b)
x  open a non-shareable file (that must not already exist) for exclusive access

Note: When using the iniSet methods to modify a .ini file, the file must be opened for both reading and writing.

Note: To open an existing or create a new file for both reading and writing (e.g. updating an .ini file) use the exists property like so:
file.open(file.exists ? 'r+':'w+');

Note: When shareable is false, uses the Synchronet nopen() function which will lock the file and perform automatic retries. The lock mode is as follows:
r  DENYWRITE - Allows other scripts to open the file for reading, but not for writing.
w  DENYALL - Does not allow other scripts to open the file when shareable is set to true
a  DENYALL - Does not allow other scripts to open the file when shareable is set to true
r+ DENYALL - Does not allow other scripts to open the file when shareable is set to true
w+ DENYALL - Does not allow other scripts to open the file when shareable is set to true
a+ DENYALL - Does not allow other scripts to open the file when shareable is set to true

When shareable is true uses the standard C fopen() function, and will only attempt to open the file once and will perform no locking.
The behavior when one script has a file opened with shareable set to a different value than is used with a new call is OS specific. On Windows, the second open will always fail and on *nix, the second open will always succeed.
popen	boolean	File.popen([string mode="r+"] [,number buffer_length])	3.15	Open pipe to command, buffer_length defaults to 2048 bytes, mode (default: 'r+') specifies the type of access requested for the file, as follows:
r  read the programs stdout;
w  write to the programs stdin
r+ open for both reading stdout and writing stdin
(only functional on UNIX systems)
close	void	File.close()	3.10	Close file
remove	boolean	File.remove()	3.10	Remove the file from the disk
clear_error	boolean	File.clear_error()	3.10	Clears the current error value (AKA clearError)
flush	boolean	File.flush()	3.10	Flush/commit buffers to disk
rewind	boolean	File.rewind()	3.11	Repositions the file pointer (position) to the beginning of a file and clears error and end-of-file indicators
truncate	boolean	File.truncate([length=0])	3.14	Changes the file length (default: 0) and repositions the file pointer (position) to the new end-of-file
lock	boolean	File.lock([offset=0] [,length=file_length-offset])	3.10	Lock file record for exclusive access (file must be opened shareable)
unlock	boolean	File.unlock([offset=0] [,length=file_length-offset])	3.10	Unlock file record for exclusive access
read	string	File.read([maxlen=file_length-file_position])	3.10	Read a string from file (optionally unix-to-unix or base64 encoding in the process), maxlen defaults to the current length of the file minus the current file position
readln	string	File.readln([maxlen=512])	3.10	Read a line-feed terminated string, maxlen defaults to 512 characters. Returns null upon end of file.
readBin	number	File.readBin([bytes=4 [,count=1]])	3.10	Read one or more binary integers from the file, default number of bytes is 4 (32-bits). if count is not equal to 1, an array is returned (even if no integers were read)
readAll	array	File.readAll([maxlen=512])	3.10	Read all lines into an array of strings, maxlen defaults to 512 characters
raw_read	string	File.raw_read([maxlen=1])	3.17	Read a string from underlying file descriptor. Undefined results when mixed with any other read/write methods except raw_write, including indirect ones. maxlen defaults to one
raw_pollin	boolean	File.raw_pollin([timeout])	3.17	Waits up to timeout milliseconds (or forever if timeout is not specified) for data to be available via raw_read().
write	boolean	File.write(text [,length=text_length])	3.10	Write a string to the file (optionally unix-to-unix or base64 decoding in the process). If the specified length is longer than the text, the remaining length will be written as NUL bytes.
writeln	boolean	File.writeln([text])	3.10	Write a new-line terminated string (a line of text) to the file
writeBin	boolean	File.writeBin(value(s) [,bytes=4])	3.10	Write one or more binary integers to the file, default number of bytes is 4 (32-bits). If value is an array, writes the entire array to the file.
writeAll	boolean	File.writeAll(array lines)	3.10	Write an array of new-line terminated strings (lines of text) to the file
raw_write	boolean	File.raw_write(text)	3.17	Write a string to the underlying file descriptor. Undefined results when mixed with any other read/write methods except raw_read, including indirect ones.
printf	number	File.printf(format [,args])	3.10	Write a C-style formatted string to the file (ala the standard C fprintf function)
iniGetSections	array	File.iniGetSections([prefix=none])	3.11	Parse all section names from a .ini file (format = '[section]') and return the section names as an array of strings, optionally, only those section names that begin with the specified prefix
iniGetKeys	array	File.iniGetKeys([section=root])	3.11	Parse all key names from the specified section in a .ini file and return the key names as an array of strings. if section is undefined, returns key names from the root section
iniGetValue	undefined	File.iniGetValue(section, key [,default=none])	3.11	Parse a key from a .ini file and return its value (format = 'key = value'). To parse a key from the root section, pass null for section. Returns the specified default value if the key or value is missing or invalid.
Returns a bool, number, string, or an array of strings determined by the type of default value specified.
Note: To insure that any/all values are returned as a string (e.g. numeric passwords are not returned as a number), pass an empty string ('') for the default value.
iniSetValue	boolean	File.iniSetValue(section, key, [value=none])	3.12	Set the specified key to the specified value in the specified section of a .ini file. to set a key in the root section, pass null for section.
iniGetObject	object	File.iniGetObject([section=root] [,bool lowercase=false] [,bool blanks=false])	3.11	Parse an entire section from a .ini file and return all of its keys (optionally lowercased) and values as properties of an object.
If section is null or undefined, returns keys and values from the root section.
If blanks is true then empty string (instead of undefined) values may included in the returned object.
Returns null if the specified section does not exist in the file or the file has not been opened.
iniSetObject	boolean	File.iniSetObject(section, object object)	3.12	Write all the properties of the specified object as separate key=value pairs in the specified section of a .ini file.
To write an object in the root section, pass null for section.
Note: this method does not remove unreferenced keys from an existing section. If your intention is to replace an existing section, use the iniRemoveSection function first.
iniGetAllObjects	array	File.iniGetAllObjects([string name_property] [,bool prefix=none] [,bool lowercase=false] [,blanks=false])	3.11	Parse all sections from a .ini file and return all (non-root) sections in an array of objects with each section's keys (optionally lowercased) as properties of each object.
name_property is the name of the property to create to contain the section's name (optionally lowercased, default is "name"), the optional prefix has the same use as in the iniGetSections method.
If a (String) prefix is specified, it is removed from each section's name.
If blanks is true then empty string (instead of undefined) values may be included in the returned objects.
iniSetAllObjects	boolean	File.iniSetAllObjects(object array [,name_property="name"])	3.12	Write an array of objects to a .ini file, each object in its own section named after the object's name_property (default: name)
iniRemoveKey	boolean	File.iniRemoveKey(section, key)	3.14	Remove specified key from specified section in .ini file.
iniRemoveSection	boolean	File.iniRemoveSection(section)	3.14	Remove specified section from .ini file.
iniRemoveSections	boolean	File.iniRemoveSections([prefix])	3.20	Remove all sections from .ini file, optionally only sections with the specified section name prefix.
iniReadAll	array	File.iniReadAll()	3.18c	Read entire .ini file into an array of strings (with !includeed files).

File properties
Name	Type	Ver	Description
name	string	3.10	Filename specified in constructor - READ ONLY
mode	string	3.10	Mode string specified in open call - READ ONLY
exists	boolean	3.10	true if the file is open or exists (case-insensitive) - READ ONLY
is_open	boolean	3.10	true if the file has been opened successfully - READ ONLY
eof	boolean	3.10	true if the current file position is at the end of file - READ ONLY
error	number	3.10	The last occurred error value (use clear_error to clear) - READ ONLY
descriptor	number	3.10	The open file descriptor (advanced use only) - READ ONLY
etx	number	3.10	End-of-text character (advanced use only), if non-zero used by read, readln, and write
debug	boolean	3.10	Set to true to enable debug log output
position	number	3.10	The current file position (offset in bytes), change value to seek within file
date	number	3.11	Last modified date/time (in time_t format)
length	number	3.10	The current length of the file (in bytes)
attributes	number	3.10	File type/mode flags (i.e. struct stat.st_mode value, compatible with file_chmod())
network_byte_order	boolean	3.11	Set to true if binary data is to be written and read in Network Byte Order (big end first)
rot13	boolean	3.11	Set to true to enable automatic ROT13 translation of text
uue	boolean	3.11	Set to true to enable automatic Unix-to-Unix encode and decode on read and write calls
yenc	boolean	3.11	Set to true to enable automatic yEnc encode and decode on read and write calls
base64	boolean	3.11	Set to true to enable automatic Base64 encode and decode on read and write calls
crc16	number	3.11	Calculated 16-bit CRC of file contents - READ ONLY
crc32	number	3.11	Calculated 32-bit CRC of file contents - READ ONLY
chksum	number	3.11	Calculated 32-bit checksum of file contents - READ ONLY
md5_hex	undefined	3.11	Calculated 128-bit MD5 digest of file contents as hexadecimal string - READ ONLY
md5_base64	undefined	3.11	Calculated 128-bit MD5 digest of file contents as base64-encoded string - READ ONLY
sha1_hex	undefined	3.19	Calculated 160-bit SHA1 digest of file contents as hexadecimal string - READ ONLY
sha1_base64	undefined	3.19	Calculated 160-bit SHA1 digest of file contents as base64-encoded string - READ ONLY
ini_key_len	number	3.17	Ini style: minimum key length (for left-justified white-space padded keys)
ini_key_prefix	object	3.17	Ini style: key prefix (e.g. '\t', null = default prefix)
ini_section_separator	object	3.17	Ini style: section separator (e.g. '\n', null = default separator)
ini_value_separator	object	3.17	Ini style: value separator (e.g. ' = ', null = default separator)
ini_bit_separator	object	3.17	Ini style: bit separator (e.g. ' | ', null = default separator)
ini_literal_separator	object	3.17	Ini style: literal separator (null = default separator)
*/