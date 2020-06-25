from datetime import datetime
from filebase_api import fapi_remote, FilebaseApiPage


@fapi_remote
def test_interval(page: FilebaseApiPage, msg: str = "No message"):
    return {"msg": msg, "server_time": datetime.now()}
