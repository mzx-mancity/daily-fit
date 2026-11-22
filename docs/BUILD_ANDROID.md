# 打包安卓 APK(不依赖 Android Studio)

网页本体在仓库根目录,安卓外壳在 `android/`,用一个 Python 脚本把两边合起来打成 APK。

## 需要的组件

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| JDK | 17 | 提供 javac / keytool;d8 与 apksigner 也要靠它跑 |
| build-tools | 34.0.0 | 提供 aapt2.exe、zipalign.exe、lib/d8.jar、lib/apksigner.jar |
| platform | android-34 | 提供 android.jar(编译期 API 存根) |

下载(国内可用腾讯云镜像):

- https://mirrors.cloud.tencent.com/AndroidSDK/build-tools_r34-windows.zip
- https://mirrors.cloud.tencent.com/AndroidSDK/platform-34-ext7_r03.zip
- JDK 17:https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_windows-x64_bin.zip

## 一条命令

@@
python tools/build_apk.py --sdk D:/android-sdk --version-name 1.4.0 --version-code 5
@@

脚本会:

1. 把 `android/res`、`android/java`、`android/AndroidManifest.xml` 和网页文件(index.html / css / js / sw.js / manifest / icons)
   复制到 `build_android/`
2. `aapt2 compile` + link(生成 R.java,资源 + 清单 + assets 打成 base.apk)
3. `javac` 编译 Java,`d8` 转成 classes.dex,塞进 APK
4. `zipalign` 对齐,`apksigner` 签名(没有 keystore 会自动生成一个)
5. `apksigner verify` + `aapt2 dump badging` 自检,打印 versionCode / 体积 / sha256

产物默认 `build_android/daily-fit-<版本>.apk`,也可以用 `--out` 指定。

## 目录约定

@@
android/
  AndroidManifest.xml     清单(包名 com.mzx.dailyfit,minSdk 24,targetSdk 34)
  java/com/mzx/dailyfit/MainActivity.java   30 多行的 WebView 外壳
  res/values/{strings,styles}.xml           应用名「轻记健身」与主题
  res/mipmap-*/ic_launcher.png              启动图标
tools/build_apk.py        打包脚本
build_android/            构建中间产物(可随时删)
@@

## 两个坑

- 改完网页要重新打包才算更新(App 里的资源是打进 APK 的);用 Pages 版则是刷新即生效。
- keystore 必须留着:换签名后覆盖安装会失败,得先卸载旧版。仓库里不提交 keystore。

## 为什么资源要走虚拟域名

WebView 直接 `loadUrl(file:///android_asset/index.html)` 的 origin 是 opaque 的,
localStorage、部分存储 API 会受限。MainActivity 拦截 `https://appassets.androidplatform.net/**`
并从 `assets/public/**` 返回,等于给页面一个正常的 https 安全源,代价只有几十行 Java。

## 版本历史

- v1.3.0 及以前:还带着 Keep 截图 OCR(11MB 的 tesseract.js)与「选择截图」的文件选择器实现
  (WebChromeClient.onShowFileChooser + CacheFileProvider)。v1.4.0 移除 Keep 后这些代码也一起删了。
