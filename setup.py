#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
from setuptools import setup

here = os.path.abspath(os.path.dirname(__file__))


def get_version():
    version_file_path = os.path.join(here, "package_version.txt")
    if not os.path.isfile(version_file_path):
        return "debug"
    version = None
    with open(version_file_path, "r") as raw:
        version = raw.read()

    return version


setup(
    name="filebase_api",
    version=get_version(),
    description="A simple web api builder for python apps. Integrates Jinja templates, fileserver and websockets.",
    long_description="Please see the github repo and help @ https://github.com/LamaAni/FilebaseAPI",
    classifiers=[],
    author="Zav Shotan",
    author_email="",
    url="https://github.com/LamaAni/zthreading.py",
    packages=["filebase_api"],
    platforms="any",
    license="LICENSE",
    install_requires=["match_pattern", "zthreading", "TicTocTimer", "zcommon", "jinja2", "sanic"],
    python_requires=">=3.6",
    include_package_data=True,
)
