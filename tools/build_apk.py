#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""不用 Gradle,直接用 Android SDK 命令行工具把网页资源打成一个 WebView APK。

用法(先解压 JDK / build-tools / platform 到同一个 sdk 目录):
    python tools/build_apk.py --sdk D:/android-sdk --keystore android/dailyfit.keystore \
        --version-name 1.4.0 --version-code 5

--sdk 目录里需要能自动找到:jdk*(含 bin/javac)、含 aapt2 的 build-tools、含 android.jar 的 platform。
第一次没有 keystore 会自动生成一个(自签名,个人使用足够)。
"""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID = os.path.join(REPO, "android")
WEB_FILES = ["index.html", "sw.js", "manifest.webmanifest"]
WEB_DIRS = ["css", "js", "icons"]
PAGE = "com.mzx.dailyfit"


def find_sdk(sdk):
    jdk = bt = plat = None
    for name in sorted(os.listdir(sdk)):
        p = os.path.join(sdk, name)
        if not os.path.isdir(p):
            continue
        if os.path.isfile(os.path.join(p, "bin", "javac.exe")) or os.path.isfile(os.path.join(p, "bin", "javac")):
            jdk = p
        elif os.path.isfile(os.path.join(p, "aapt2.exe")) or os.path.isfile(os.path.join(p, "aapt2")):
            bt = p
        elif os.path.isfile(os.path.join(p, "android.jar")):
            plat = p
    if not (jdk and bt and plat):
        sys.exit("在 %s 里没找全 JDK / build-tools / platform(jdk=%s bt=%s plat=%s)" % (sdk, jdk, bt, plat))
    return jdk, bt, plat


def run(args, **kw):
    p = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if p.returncode != 0:
        print("命令失败:", args[0])
        print((p.stdout or "")[-2000:])
        print((p.stderr or "")[-2000:])
        sys.exit(1)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sdk", default=os.environ.get("ANDROID_SDK", ""), help="SDK 目录(含 jdk/build-tools/platform)")
    ap.add_argument("--work", default=os.path.join(REPO, "build_android"))
    ap.add_argument("--out", default="")
    ap.add_argument("--keystore", default=os.path.join(ANDROID, "dailyfit.keystore"))
    ap.add_argument("--ks-alias", default="dailyfit")
    ap.add_argument("--ks-pass", default="dailyfit")
    ap.add_argument("--version-name", default="")
    ap.add_argument("--version-code", default="")
    args = ap.parse_args()
    if not args.sdk:
        sys.exit("请用 --sdk 指定 SDK 目录")

    jdk, bt, plat = find_sdk(args.sdk)
    ajar = os.path.join(plat, "android.jar")
    work = args.work
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(work)
    app = os.path.join(work, "app")
    shutil.copytree(os.path.join(ANDROID, "res"), os.path.join(app, "res"))
    shutil.copytree(os.path.join(ANDROID, "java"), os.path.join(app, "java"))
    man_src = os.path.join(ANDROID, "AndroidManifest.xml")
    man = os.path.join(app, "AndroidManifest.xml")
    txt = open(man_src, encoding="utf-8").read()
    if args.version_name:
        txt = re.sub(r'android:versionName="[^"]*"', 'android:versionName="%s"' % args.version_name, txt)
    if args.version_code:
        txt = re.sub(r'android:versionCode="\d+"', 'android:versionCode="%s"' % args.version_code, txt)
    open(man, "w", encoding="utf-8").write(txt)
    ver = re.search(r'android:versionName="([^"]*)"', txt).group(1)
    vcode = re.search(r'android:versionCode="(\d+)"', txt).group(1)

    # 网页资源
    pub = os.path.join(app, "assets", "public")
    os.makedirs(pub)
    for f in WEB_FILES:
        shutil.copy2(os.path.join(REPO, f), os.path.join(pub, f))
    for d in WEB_DIRS:
        shutil.copytree(os.path.join(REPO, d), os.path.join(pub, d))

    # 资源 + 清单 -> base.apk(顺便生成 R.java)
    flat = os.path.join(work, "res.zip")
    run([os.path.join(bt, "aapt2.exe"), "compile", "--dir", os.path.join(app, "res"), "-o", flat])
    gen = os.path.join(work, "gen")
    os.makedirs(gen)
    base_apk = os.path.join(work, "base.apk")
    run([os.path.join(bt, "aapt2.exe"), "link", "-o", base_apk, "-I", ajar,
         "--manifest", man, "-A", os.path.join(app, "assets"), "--java", gen,
         "--min-sdk-version", "24", "--target-sdk-version", "34", flat])

    # Java -> class -> dex
    srcs = []
    for root, _, files in os.walk(os.path.join(app, "java")):
        srcs += [os.path.join(root, f) for f in files if f.endswith(".java")]
    for root, _, files in os.walk(gen):
        srcs += [os.path.join(root, f) for f in files if f.endswith(".java")]
    cls = os.path.join(work, "classes")
    os.makedirs(cls)
    run([os.path.join(jdk, "bin", "javac.exe"), "-source", "8", "-target", "8", "-encoding", "UTF-8",
         "-classpath", ajar, "-d", cls] + srcs)
    jar = os.path.join(work, "classes.jar")
    with zipfile.ZipFile(jar, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(cls):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, cls).replace(os.sep, "/"))
    dexdir = os.path.join(work, "dex")
    os.makedirs(dexdir)
    run([os.path.join(jdk, "bin", "java.exe"), "-cp", os.path.join(bt, "lib", "d8.jar"),
         "com.android.tools.r8.D8", "--min-api", "24", "--lib", ajar, "--output", dexdir, jar])

    unsigned = os.path.join(work, "app-unsigned.apk")
    shutil.copy2(base_apk, unsigned)
    with zipfile.ZipFile(unsigned, "a", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(dexdir, "classes.dex"), "classes.dex")
    aligned = os.path.join(work, "app-aligned.apk")
    run([os.path.join(bt, "zipalign.exe"), "-f", "-p", "4", unsigned, aligned])

    ks = args.keystore
    if not os.path.exists(ks):
        print("没找到 keystore,自动生成一个:", ks)
        os.makedirs(os.path.dirname(ks), exist_ok=True)
        run([os.path.join(jdk, "bin", "keytool.exe"), "-genkeypair", "-keystore", ks,
             "-alias", args.ks_alias, "-storepass", args.ks_pass, "-keypass", args.ks_pass,
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-dname", "CN=DailyFit, OU=Personal, O=MZX, C=CN"])

    out = args.out or os.path.join(work, "daily-fit-%s.apk" % ver)
    run([os.path.join(jdk, "bin", "java.exe"), "-jar", os.path.join(bt, "lib", "apksigner.jar"), "sign",
         "--ks", ks, "--ks-key-alias", args.ks_alias,
         "--ks-pass", "pass:" + args.ks_pass, "--key-pass", "pass:" + args.ks_pass,
         "--min-sdk-version", "24", "--out", out, aligned])
    run([os.path.join(jdk, "bin", "java.exe"), "-jar", os.path.join(bt, "lib", "apksigner.jar"), "verify", out])
    bad = run([os.path.join(bt, "aapt2.exe"), "dump", "badging", out]).stdout or ""

    size = os.path.getsize(out)
    sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
    print("\n%s v%s -> %s" % (PAGE, ver, out))
    print("versionCode=%s size=%.2fMB" % (vcode, size / 1048576.0))
    print("sha256=" + sha)
    for line in bad.splitlines()[:2]:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
