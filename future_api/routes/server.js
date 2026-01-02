/*
server object
Server-specific properties - introduced in v3.10

server properties
Name	Type	Ver	Description
version	string	3.10	Server name and version number
version_detail	string	3.10	Detailed version/build information
interface_ip_address	string	3.11	First bound IPv4 address (0.0.0.0 = ANY) (obsolete since 3.17, see interface_ip_addr_list)
options	number	3.11	Bit-field of server-specific startup options
clients	number	3.11	Number of active clients (if available)
interface_ip_addr_list	object	N/A	Array of IP addresses of bound network interface (0.0.0.0 = ANY)
*/