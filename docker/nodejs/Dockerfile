FROM node:alpine3.13

RUN apk update &&\
    apk add \
    git\
    curl \
    sudo \
    bash \
    openssh 

ARG GIT_AUTOSYNC_VERSION=1.2.6
ARG ZBASH_COMMONS_VERSION=0.1.11
ENV GIT_AUTOSYNC_VERSION=${GIT_AUTOSYNC_VERSION}\
    ZBASH_COMMONS_VERSION=${ZBASH_COMMONS_VERSION}

# Install git autosync (latest) (uses env GIT_AUTOSYNC_VERSION)
RUN curl -Ls "https://raw.githubusercontent.com/LamaAni/git_autosync/master/install?ts_$(date +%s)=$RANDOM" | bash &&\
    curl -H 'Cache-Control: no-cache' -Ls "https://raw.githubusercontent.com/LamaAni/zbash-commons/master/install?ts_$(date +%s)=$RANDOM" | $(which sudo || echo "") bash

ARG USER=stratis
ARG ENABLE_GIT_AUTOSYNC=false
ARG STRATIS_SERVE_PATH=/www
ARG GIT_AUTOSYNC_REPO_URL=
ARG GIT_AUTOSYNC_SSH_KEY_PATH=/var/secrets/git-autosync-ssh-key
ARG GIT_AUTOSYNC_REPO_BRANCH=master
ARG GIT_AUTOSYNC_REPO_LOCAL_PATH=/www
ARG GIT_AUTOSYNC_RUN_ASYNC=1


ENV PS1="\A \h \w > "\
    GIT_AUTOSYNC_SSH_KEY_PATH="${GIT_AUTOSYNC_SSH_KEY_PATH}"\
    GIT_AUTOSYNC_REPO_BRANCH="${GIT_AUTOSYNC_REPO_BRANCH}"\
    GIT_AUTOSYNC_REPO_LOCAL_PATH="${GIT_AUTOSYNC_REPO_LOCAL_PATH}"\
    GIT_AUTOSYNC_RUN_ASYNC="${GIT_AUTOSYNC_RUN_ASYNC}"\
    GIT_AUTOSYNC_REPO_URL="${GIT_AUTOSYNC_REPO_URL}"\
    STRATIS_SERVE_PATH="${STRATIS_SERVE_PATH}"\
    ENABLE_GIT_AUTOSYNC="${ENABLE_GIT_AUTOSYNC}"

WORKDIR /www
COPY ./docker/nodejs/entrypoint /entrypoint

WORKDIR /usr/lib/stratis
COPY ./nodejs ./nodejs
COPY ./package.json .

RUN npm install && npm install -g . &&\
    chmod +x /entrypoint &&\
    git config --global pull.ff only

CMD [ "/entrypoint" ]