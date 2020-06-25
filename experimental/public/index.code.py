from datetime import datetime
from filebase_api import fapi_remote, FilebaseApiPage


@fapi_remote
def test(page: FilebaseApiPage, msg: str):
    return "The message: " + msg


@fapi_remote
def test_with_defaults(page: FilebaseApiPage, msg: str, other_message: str = None):
    return {
        "msg": msg,
        "other_message": other_message,
    }


@fapi_remote
def test_interval(page: FilebaseApiPage, msg: str = "No message"):
    return {"msg": msg, "server_time": datetime.now()}
