/*
MQTT class
Class used for MQTT communications - introduced in v3.20

To create a new MQTT object: var mqtt = new MQTT([client_id])

MQTT methods
Name	Returns	Usage	Ver	Description
connect	boolean	MQTT.connect([string broker_address] [,number broker_port] [,string username] [,string password])	3.20	Connect to an MQTT broker, by default (i.e. no arguments provided), the broker configured in SCFG->Networks->MQTT
disconnect	void	MQTT.disconnect()	3.20	Close an open connection to the MQTT broker
publish	boolean	MQTT.publish([bool retain=false,] [number qos,] topic, data)	3.20	Publish a string to specified topic
subscribe	boolean	MQTT.subscribe([number qos,] topic)	3.20	Subscribe to specified topic at (optional) QOS level
read	string	MQTT.read([number timeout=0] [,bool verbose=false])	3.20	Read next message, optionally waiting for timeout milliseconds, returns an object instead of a string when verbose is true. Returns false when no message is available.

MQTT properties
Name	Type	Ver	Description
error	number	3.20	Result (error value) of last MQTT library function call - READ ONLY
error_str	string	3.20	Result description of last MQTT library function call - READ ONLY
library	string	3.20	MQTT library name and version - READ ONLY
broker_addr	string	3.20	IP address or hostname of MQTT broker to connect to, by default
broker_port	number	3.20	TCP port number of MQTT broker to connect to, by default
username	string	3.20	Username to use when authenticating with MQTT broker, by default
password	string	3.20	Password to use when authenticating with MQTT broker, by default
keepalive	number	3.20	Seconds of time to keep inactive connection alive
protocol_version	number	3.20	Protocol version number (3 = 3.1.0, 4 = 3.1.1, 5 = 5.0)
publish_qos	number	3.20	Quality Of Service (QOS) value to use when publishing, by default
subscribe_qos	number	3.20	Quality Of Service (QOS) value to use when subscribing, by default
tls_mode	number	3.20	TLS (encryption) mode
tls_ca_cert	string	3.20	TLS Certificate Authority (CA) certificate (file path)
tls_client_cert	string	3.20	TLS Client certificate (file path)
tls_private_key	string	3.20	Private key file
tls_key_password	string	3.20	Private key file password
tls_psk	string	3.20	TLS Pre-Shared-Key
tls_psk_identity	string	3.20	TLS PSK Identity
data_waiting	boolean	3.20	true if messages are waiting to be read
read_level	number	3.20	Number of messages waiting to be read
*/