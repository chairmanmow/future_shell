# Objective
We are trying to create an API service on synchronet which we can connect to from an external machine to enable bidirection communication from a client to trigger certain synchronet methods and return response data to the client to process.  

As an example of an ideal implementation might be we receive a packet like so from the client:

```
{"scope":"FUTURE_API","func":"QUERY","oper":"READ","location":"system/username?user_number=27","lock":1,"timeout":8000}
```

That would then be able to call system.username(27);

## Server: (synchronet + spidermonkey) `/sbbs/mods/future_api/service.js` & `/sbbs/mods/future_api/routes/*`

Our service.js file should mostly be responsible for loading the routes and delegating the handling of functionality to various files in `future_api/routes` before returning a response to the client.  This file should also be responsible for any logging, we should always log errors (not swallow) and we should be able to turn on a verbose mode logging all external connections, which we want turned on for our initial development.  It would be good if we could try to define things in terms of CRUD in terms of CRUD operations, and prioritize GET/READ implementations for a first wave if complexity kicks in.

## Client: (nodejs) `/sbbs/mods/future_api/connector/` & `/sbbs/mods/future_api/connector/api_definitions/*`

Ultimately, most of the deliverables for the client will be reflected in synchro-api and any submodules we wish to load there... I've also added an api_defintions, at the very least maybe we structure this as json data so we essentially know the expected contract.  It would be good if we could try to define things in terms of CRUD in terms of CRUD operations.

I've included a file that we've gotten working inside `/sbbs/mods/connector/chat-bot-example.mjs` as it does successfully read and write from a JSON-Client based service.js file.  It's just for reference, although it's closer to how this will be used in production once the API works.  I threw some methods from there in to future-api-connector.js.  Really we are using the client program as a testing mechanism while building up it's definitions and abilities to call methods on the API vioa the library code in `synchr-api.js`

---

## CREATE Operations (Message Posting & File Uploads)

The API now supports CREATE operations for whitelisted resources. This provides a sandboxed way to test write functionality before opening it up more broadly.

### Whitelist Configuration

Edit `/sbbs/mods/future_api/lib/whitelist.js` to control which subs and directories allow CREATE operations.

### Message Posting Endpoints

**Discovery:**
```json
{"scope":"FUTURE_API","func":"QUERY","oper":"READ","location":"messages/writable"}
```
Returns list of subs that allow posting.

**Post a message:**
```json
{
  "scope": "FUTURE_API",
  "func": "QUERY",
  "oper": "CREATE",
  "location": "messages/post",
  "data": {
    "subCode": "metatronsmusings",
    "from": "API User",
    "to": "All",
    "subject": "Test Message",
    "body": "This is the message body text.",
    "replyTo": null
  }
}
```

**Alternative endpoint (with subCode in path):**
```json
{
  "scope": "FUTURE_API",
  "func": "QUERY",
  "oper": "CREATE",
  "location": "messages/sub/metatronsmusings/post",
  "data": {
    "from": "API User",
    "subject": "Test Message",
    "body": "Message body here"
  }
}
```

### File Upload Endpoints

**Discovery:**
```json
{"scope":"FUTURE_API","func":"QUERY","oper":"READ","location":"files/writable"}
```
Returns list of directories that allow uploads.

**Add existing file to filebase:**
```json
{
  "scope": "FUTURE_API",
  "func": "QUERY",
  "oper": "CREATE",
  "location": "files/add",
  "data": {
    "dirCode": "metatronstuff",
    "filename": "myfile.zip",
    "description": "My uploaded file",
    "from": "API User",
    "extDesc": "Extended description here",
    "tags": "utility,archive"
  }
}
```
Note: The file must already exist on disk in the directory's path.

**Create text file and add to filebase:**
```json
{
  "scope": "FUTURE_API",
  "func": "QUERY",
  "oper": "CREATE",
  "location": "files/create",
  "data": {
    "dirCode": "metatronstuff",
    "filename": "readme.txt",
    "content": "This is the content of the text file.",
    "description": "A readme file",
    "from": "API User",
    "overwrite": false
  }
}
```

**Alternative endpoints (with dirCode in path):**
- `files/dir/{code}/add` - Add existing file
- `files/dir/{code}/create` - Create text file

---

### Other Considerations
Documenting the API so an agent can know how / when to use it.  This will ultimately be used by an AI chatbot to gain more context in conversations about the system.

A generic approach that can call methods dynamically seems within reach, which would be great because we get all the benefits at once.  Rather than have to take an additive approach, we can subtract what shouldn't be there.  Ultimately we'll want to block some of these methods if we create a sufficiently generic approach for security considerations.

Not every route we are going to include is also going to map to a SynchronetJSOBJ model reference, we are going to have stuff where we can query files, and we sort of started down that route with the /routes/usage.js which is a different type of implementation.  We're not going to conern ourselves with that from the start until we get further along in the plan /testing.

# Plan
1. The first thing we need to accomplish and prove is that our client and server are communicating.  We don't need to prove: a) that we can call methods from synchronet beyond what is needed to send a basic payload or b) do anything besides logging.  We need to try to hit our `ping` route and get a  `pong` response.  The server should be verbose, and the client should throw a big error that saying that it's not working as EXPECTED if it never gets the response it expected.  The server should also log all incoming data.  We need to insure that bi-directional socket communication is working.  
2. After we can prove #1 works, we can either:
    a) work on a generic model for the synchronet javascript object model
    b) work on specific implementations we have in mind like usage.js

In either event we'll try to keep our client library and server implementations in sync.  We'll use `future-api-connector.mjs` for running tests of our implementation, it's not intended to be production code.