import os
import logging
from filebase_api import WebServer, logger

logger.setLevel(logging.INFO)
WebServer.start_global_web_server(os.path.dirname(__file__)).join()
