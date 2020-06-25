from typing import Callable
from functools import wraps
from zcommon.shell import logger
from filebase_api.helpers import (
    FilebaseApiPage,
    FILEBASE_API_REMOTE_METHOD_MARKER_ATTRIB_NAME,
    FILEBASE_API_REMOTE_METHOD_MARKER_CONFIG_ATTRIB_NAME,
    FilebaseApiRemoteMethodConfig,
)


def fapi_remote(fun):
    """DECORATOR

    Expose this method to remote websocket client.
    """
    setattr(fun, FILEBASE_API_REMOTE_METHOD_MARKER_ATTRIB_NAME, True)
    return fun


def fapi_remote_config(config: FilebaseApiRemoteMethodConfig = None):
    """Add configuration to a remote websocket function.

    Args:
        config (FilebaseApiRemoteMethodConfig, optional): The configuration. If none ignored. Defaults to None.
    """

    def decorator(fun):
        setattr(fun, FILEBASE_API_REMOTE_METHOD_MARKER_CONFIG_ATTRIB_NAME, config)
        return fun


def fapi_extra_logs(fun):
    """Adds extra server side logs to remote websocket client method.
    """

    @wraps(fun)
    def wrapper(page: FilebaseApiPage, *args, **kwargs):
        logger.info(f"[PAGE: {page.page_id}] Started {fun.__name__}")
        rslt = fun(page, *args, **kwargs)
        logger.info(f"[PAGE: {page.page_id}] Completed {fun.__name__}")
        return rslt

    return wrapper


def fapi_allow_if(cond: Callable, reason: str):
    """Allows this function to be called if the condition is true.

    Args:
        cond (Callable): The condition. If the value True, will allow.
        reason (str): The string description, or the return value, of the disallow.
    """

    def fapi_allow_if_decorator(fun):
        if not callable(cond):
            if cond is True:
                return fun
        elif cond() is True:
            return fun

        @wraps(fun)
        def not_allowed(*args, **kwargs):
            return (
                {"type": "inactive", "msg": reason or "Method not allowed or inactive"}
                if isinstance(reason, str)
                else reason
            )

        return not_allowed

    return fapi_allow_if_decorator
