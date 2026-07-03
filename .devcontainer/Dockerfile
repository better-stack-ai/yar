FROM archlinux:latest

# Sync package database and install base tooling
# docker CLI (no daemon) lets `docker compose` talk to the host Podman socket
RUN pacman -Syu --noconfirm \
    && pacman -S --noconfirm --needed \
        base-devel \
        bash \
        ca-certificates \
        curl \
        docker \
        docker-compose \
        git \
        github-cli \
        make \
        openssh \
        procps-ng \
        sudo \
        unzip \
    && pacman -Scc --noconfirm

# Create a non-root user matching the host UID/GID (1000/1000 on SteamOS)
ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=1000
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/bash $USERNAME \
    && echo "$USERNAME ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
WORKDIR /home/$USERNAME

# Install mise (runtime version manager)
RUN curl https://mise.run | sh
ENV PATH="/home/$USERNAME/.local/bin:$PATH"

# Node 20 matches the repo's CI workflows; pnpm 10.14.0 matches the
# "packageManager" field in package.json (activated via corepack).
RUN mise use --global node@20 \
    && mise exec -- corepack enable \
    && mise exec -- corepack prepare pnpm@10.14.0 --activate

RUN echo 'eval "$(mise activate bash)"' >> ~/.bashrc \
    && echo 'eval "$(mise activate bash)"' >> ~/.profile

ENV PATH="/home/$USERNAME/.local/share/mise/shims:$PATH"
