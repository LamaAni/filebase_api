#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
from setuptools import setup

here = os.path.abspath(os.path.dirname(__file__))


def get_version():
    return os.environ.get("VERSION", "debug")


setup(
    name="stratis-webservice",
    version=get_version(),
    description="A simple web template engine for fast api's and websites."
    + " Very low memory and cpu print that fits docker and kubernetes pods, or can run parallel to your application",
    long_description="Please see the github repo and help @ https://github.com/LamaAni/stratis",
    classifiers=[],
    author="Zav Shotan",
    author_email="",
    url="https://github.com/LamaAni/stratis",
    packages=["stratis_webservice"],
    platforms="any",
    license="LICENSE",
    install_requires=["match_pattern", "zthreading", "TicTocTimer", "zcommon", "jinja2", "sanic"],
    python_requires=">=3.6",
    include_package_data=True,
)
