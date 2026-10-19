#!/usr/bin/env bash
set -euo pipefail

# GitHub's runner image is not guaranteed to include ffprobe.
# Install the distribution ffmpeg package only if validation tools are absent.
if ! command -v ffprobe >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "::error::ffprobe missing and apt-get unavailable; no video was published."
    exit 1
  fi
  echo "Installing ffprobe before any private video download or publication."
  sudo apt-get update -qq
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg
fi
command -v ffprobe >/dev/null 2>&1 || { echo "::error::ffprobe unavailable; no social publication attempted."; exit 1; }
ffprobe -version
