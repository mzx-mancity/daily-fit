#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通过 GitHub Git Data API 推送本地提交历史(绕开本机 git 的 schannel 凭据问题)。

用法:
    set GITHUB_TOKEN=ghp_xxx  && python tools/push_github.py
    set GITHUB_TOKEN=... && set PAGES=1 && python tools/push_github.py   # 顺手开 GitHub Pages
    python tools/push_github.py --dry                                   # 只演练,不联网

token 只从环境变量读取,脚本不会打印它。
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

REPO = os.environ.get("REPO", "mzx19159506939-del/daily-fit")
DRY = "--dry" in sys.argv or os.environ.get("DRY_RUN") == "1"
PAGES = os.environ.get("PAGES") == "1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.github.com"


def find_token():
    """优先环境变量,其次工作区根目录的 token.txt(用完即删)。"""
    tok = os.environ.get("GITHUB_TOKEN", "").strip()
    if tok:
        return tok
    candidates = [os.environ.get("TOKEN_FILE"), os.path.join(ROOT, "..", "token.txt")]
    for c in candidates:
        if c and os.path.isfile(c):
            with open(c, "r", encoding="utf-8-sig") as fh:
                return fh.read().strip()
    return ""


TOKEN = find_token()
AUTHOR = {
    "name": "mzx19159506939-del",
    "email": "mzx19159506939-del@users.noreply.github.com",
}


def git(*args):
    r = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("git %s 失败: %s" % (" ".join(args), r.stderr.decode("utf-8", "replace")[:300]))
    return r.stdout.decode("utf-8", "replace")


def gh(method, path, body=None):
    if DRY:
        extra = ""
        if isinstance(body, dict) and "tree" in body:
            extra = "(tree %d entries)" % len(body["tree"])
        print("  [dry] %s %s %s" % (method, path, extra))
        return {"sha": "dry-" + os.urandom(4).hex(), "object": {"sha": "dry"}, "default_branch": "main", "html_url": ""}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "daily-fit-push")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode("utf-8", "replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        err = RuntimeError("%s %s -> %s %s" % (method, path, e.code, detail))
        err.status = e.code
        raise err


def make_tree(entries, base_tree=None):
    body = {"tree": entries}
    if base_tree:
        body["base_tree"] = base_tree
    return gh("POST", "/repos/%s/git/trees" % REPO, body)


def build_entries(files, removed):
    entries = []
    for f in files:
        with open(os.path.join(ROOT, f), "rb") as fh:
            buf = fh.read()
        blob = gh("POST", "/repos/%s/git/blobs" % REPO,
                  {"content": base64.b64encode(buf).decode("ascii"), "encoding": "base64"})
        entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("  + %s (%.0fKB)" % (f, len(buf) / 1024.0))
    for f in removed:
        entries.append({"path": f, "mode": "100644", "type": "blob", "sha": None})
        print("  - %s" % f)
    return entries


def main():
    if not TOKEN and not DRY:
        print("缺少环境变量 GITHUB_TOKEN")
        return 2
    shas = [s for s in git("log", "--reverse", "--format=%H").split("\n") if s.strip()]
    branch, parent = "main", None
    if not DRY:
        info = gh("GET", "/repos/" + REPO)
        branch = info.get("default_branch") or "main"
        try:
            ref = gh("GET", "/repos/%s/git/ref/heads/%s" % (REPO, branch))
            parent = ref["object"]["sha"]
        except RuntimeError as e:
            # 空仓库会返回 409(Git Repository is empty),老版本返回 404,都视为无父提交
            if getattr(e, "status", None) not in (404, 409):
                raise
    if os.environ.get("FORCE") == "1":
        parent = None
        print("FORCE=1:忽略远端已有提交,强推")
    print("repo=%s branch=%s commits=%d %s" % (REPO, branch, len(shas), "(远端已有提交)" if parent else "(远端为空)"))

    prev_sha, prev_tree, last_sha = None, None, None
    for sha in shas:
        if prev_sha is None:
            files = [f for f in git("ls-tree", "-r", "--name-only", sha).split("\n") if f.strip()]
            removed = []
        else:
            files = [f for f in git("diff", "--name-only", "--diff-filter=d", prev_sha, sha).split("\n") if f.strip()]
            removed = [f for f in git("diff", "--name-only", "--diff-filter=D", prev_sha, sha).split("\n") if f.strip()]
        entries = build_entries(files, removed)
        tree_sha = make_tree(entries, prev_tree)["sha"] if entries else prev_tree
        msg = git("log", "-1", "--format=%B", sha).strip()
        parents = [last_sha] if last_sha else ([parent] if parent else [])
        commit = gh("POST", "/repos/%s/git/commits" % REPO,
                    {"message": msg, "tree": tree_sha, "parents": parents, "author": AUTHOR})
        print("commit %s %s [%d files]" % (commit["sha"][:7], msg.split("\n")[0], len(files)))
        last_sha, prev_sha, prev_tree = commit["sha"], sha, tree_sha

    if DRY:
        print("演练完成,未联网。")
        return 0
    if not last_sha:
        print("没有本地提交可推。")
        return 1

    if not parent:
        try:
            gh("POST", "/repos/%s/git/refs" % REPO, {"ref": "refs/heads/" + branch, "sha": last_sha})
        except RuntimeError as e:
            if getattr(e, "status", None) == 422:
                gh("PATCH", "/repos/%s/git/refs/heads/%s" % (REPO, branch), {"sha": last_sha, "force": True})
            else:
                raise
    else:
        gh("PATCH", "/repos/%s/git/refs/heads/%s" % (REPO, branch), {"sha": last_sha, "force": False})
    print("已推送 -> %s" % branch)

    for c in gh("GET", "/repos/%s/commits?per_page=5" % REPO):
        print("  remote:", c["sha"][:7], c["commit"]["message"].split("\n")[0])

    if PAGES:
        try:
            gh("POST", "/repos/%s/pages" % REPO, {"source": {"branch": branch, "path": "/"}})
            print("已开启 GitHub Pages")
        except RuntimeError as e:
            if getattr(e, "status", None) == 409:
                print("GitHub Pages 之前已经开过了")
            else:
                print("开启 Pages 失败(可到 Settings > Pages 手动开):%s" % e)
        try:
            info = gh("GET", "/repos/%s/pages" % REPO)
            if info.get("html_url"):
                print("页面地址:", info["html_url"])
        except RuntimeError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
