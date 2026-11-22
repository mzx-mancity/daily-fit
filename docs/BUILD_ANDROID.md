# 打包安卓 APK(不依赖 Android Studio)

这个项目没有 Gradle 工程,直接用 Android SDK 命令行工具把网页资源打成一个 WebView App。

## 需要的组件

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| JDK | 17 | 提供 javac / keytool;d8 与 apksigner 也要靠它跑 |
| build-tools | 34.0.0 | 提供 aapt2.exe、zipalign.exe、lib/d8.jar、lib/apksigner.jar |
| platform | android-34 | 提供 android.jar(编译期 API 存根) |

下载(国内可用腾讯云镜像,实测 2MB/s):

- https://mirrors.cloud.tencent.com/AndroidSDK/build-tools_r34-windows.zip
- https://mirrors.cloud.tencent.com/AndroidSDK/platform-34-ext7_r03.zip
- JDK 17:https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_windows-x64_bin.zip

## 目录约定

```
_android_build/
  sdk/jdk-17.0.2/          JDK
  sdk/android-14/          build-tools 34.0.0(压缩包内目录名是 android-14)
  sdk/android-34/          platform(android.jar)
  app/
    AndroidManifest.xml
    java/com/mzx/dailyfit/MainActivity.java      主界面 + WebView + 文件选择/拍照
    java/com/mzx/dailyfit/CacheFileProvider.java 极简 ContentProvider,给相机写照片用
    res/values/{strings,styles}.xml
    res/mipmap-*/ic_launcher.png
    assets/public/         从仓库根目录复制来的 index.html / css / js / vendor / icons
```

## 打包步骤

1. aapt2 compile --dir res -o res.zip
2. aapt2 link -o base.apk -I android.jar --manifest AndroidManifest.xml -A assets --java gen --min-sdk-version 24 --target-sdk-version 34 res.zip
3. javac -encoding UTF-8 -source 8 -target 8 -classpath android.jar -d classes gen/.../R.java java/.../CacheFileProvider.java java/.../MainActivity.java
4. java -cp lib/d8.jar com.android.tools.r8.D8 --release --min-api 24 --lib android.jar --output dex classes/...
5. 用 Python zipfile 把 classes.dex 追加进 base.apk
6. zipalign -f -p 4 unsigned.apk aligned.apk
7. keytool -genkeypair 生成 dailyfit.keystore(仅第一次)
8. apksigner sign --ks dailyfit.keystore --min-sdk-version 24 --out daily-fit.apk aligned.apk
9. apksigner verify -v + aapt2 dump badging 自检

## 两个坑

- 每次改网页资源后都要重新复制到 app/assets/public/ 再打包,否则 App 里还是旧页面。
- keystore 必须保留:换签名后覆盖安装会失败,得先卸载旧版。

## 网页里的选图/拍照为什么要写 Java

网页用 input type=file 选 Keep 截图,在普通浏览器里是原生能力,但在 WebView 里
**默认的 WebChromeClient 不实现 onShowFileChooser**,点了完全没反应 —— 所以 MainActivity 里:

- 重写 onShowFileChooser,把请求交给系统文件选择器(ACTION_GET_CONTENT,走 SAF,不需要存储权限)
- 带 capture 的输入框走 ACTION_IMAGE_CAPTURE,照片写进 cacheDir/shots/shot_<时间戳>.jpg,
  该文件通过 CacheFileProvider(authority com.mzx.dailyfit.files)暴露成 content:// URI ——
  Android 7 以上不允许把 file:// 直接交给相机,会抛 FileUriExposedException
- 用户选了拍照但没给相机权限时,自动退化成文件选择器,不会让按钮变成死键
## 为什么资源要走虚拟域名

WebView 直接 loadUrl(file:///android_asset/index.html) 的 origin 是 opaque 的,
Service Worker、blob: Worker、部分存储 API 会失效,OCR 的 wasm worker 就起不来。
MainActivity 拦截 https://appassets.androidplatform.net/** 并从 assets/public/** 返回,
等于给 App 一个正常的 https 安全源,代价只有几十行 Java。
