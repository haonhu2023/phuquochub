#!/bin/sh
# PLACE-026 (OD2-4) — Postgres archive_command target.
# Invoked by Postgres as: wal-archive.sh %p %f  (source path, filename)
#
# Defaults to copying into a LOCAL directory (WAL_ARCHIVE_DIR) because no real offsite backup
# credentials exist in this repository or session (OD2-5's real target — same provider family as
# OD2-3's R2 choice — is not provisioned here). To point this at a real offsite destination once
# credentials are supplied, replace the `cp` line below with an upload command (e.g. `aws s3 cp` /
# `rclone copy`); no other WAL/PITR configuration needs to change.
set -e
SRC_PATH="$1"
FILENAME="$2"
DEST_DIR="${WAL_ARCHIVE_DIR:-/var/lib/postgresql/wal_archive}"
mkdir -p "$DEST_DIR"
test ! -f "$DEST_DIR/$FILENAME"
cp "$SRC_PATH" "$DEST_DIR/$FILENAME"
