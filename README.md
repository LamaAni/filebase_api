# Filebase Api

A simple web template engine for fast api's. Very low memory and cpu print that fits docker and kubernetes pods, or can run parallel to your application.

1. Fast html template with either Jinja (Python) or EJS (NodeJs).
1. Command line server startup.
1. Built-in REST api.
1. Build-in Websocket api.
1. NodeJS implementation (using [express.js](https://expressjs.com/)).
1. Python implementation (using [sanic] (https://github.com/sanic-org/sanic)).
1. Live update for changes in the file contents.

# ALPHA

# Core principle of operation

1. Uses file extensions to determine the role of each file in the webserver.
1. Serves a folder, and exposes all of the files in the folder to web requests.
1. The file extension `[filename].code.[js or py]` represents code files.
1. Configurable file extensions represent template files. eg. `.html`

### Types of files
1. code files - file that expose python or node functions to `REST API`, `JS API` or `Websocket API` requests.
1. template files - templated sources. All template files can be imported into one another.

### Default file extensions and behaviors

1. `html`, `htm`, `.html`, `.htm`, `.xhtml`, `.js`, `.css` - files to read as templates (either Jinja in python or EJS in NodeJS)
1. [filename].code.js - Code files in NodeJS
1. [filename].code.js - Code files in Python

# TL;DR

In a folder add the following files,

1. public/index.html
1. public/index.code.py
1. public/index.code.js
1. webserver.py

where,

_public/index.code.py_

```python
from datetime import datetime
from filebase_api import fapi_remote, FilebaseApiPage

# Expose this method on the browser page as a js function: `async fapi_test_interval(msg){...}`
@fapi_remote
def test_interval(page: FilebaseApiPage, msg: str = "No message"):
    # The return value should be a json object (date time was added as a special value)
    return {"msg": msg, "server_time": datetime.now()}

```

_public/index.html_

```html
<!DOCTYPE html5>
<html>
  <head>
    <!-- Core scripts are loaded using the jinja templates-->
    {{filebase_api()}}

    <!-- Local scripts -->
    <script lang="javascript">
      // invoked when fapi is ready to recive commands.
      fapi.ready(() => {
          setInterval(async () => {
              // ---------------------
              // The function on the server side appears on the client
              // with the addition of 'fapi_'
              console.log(await fapi_test_interval("from client"))
              // ---------------------
          }, 1000)
      })
    </script>
  </head>
  <body style="text-align: center;">
    <!-- The page id will change on every refresh -->
    "calling page: {{page.page_id}}"
  </body>
</html>
```

### Running the webserver

_public/webserver.py_

```python
import os
import logging
from filebase_api import WebServer, logger

logger.setLevel(logging.INFO)
WebServer.start_global_web_server(os.path.dirname(__file__)).join()
```

# Install

```shell
pip install filebase_api
```

## From the git repo directly

To install from master branch,

```shell
pip install git+https://github.com/LamaAni/FilebaseAPI.git@master
```

To install from a release (tag)

```shell
pip install git+https://github.com/LamaAni/FilebaseAPI.git@[tag]
```

# Contribution

Feel free to ping me in issues or directly on LinkedIn to contribute.

# Licence

Copyright ©
`Zav Shotan` and other [contributors](https://github.com/LamaAni/postgres-xl-helm/graphs/contributors).
It is free software, released under the MIT licence, and may be redistributed under the terms specified in `LICENSE`.
