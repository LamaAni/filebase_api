## FilebaseAPI

A simple web api builder for python apps. Integrates Jinja templates, fileserver and websockets.

# ALPHA

# TL;DR

In a folder add the following files,

1. public/index.html
1. public/index.code.py
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
<!DOCTYPE html5><html><head>
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
  </body></html>
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
pip install filbase_api
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
