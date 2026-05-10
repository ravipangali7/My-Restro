import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../constants/app_constants.dart';

/// WebView shell: in-site history via [WebViewController.goBack], exit confirm at root.
class SiteWebViewScreen extends StatefulWidget {
  const SiteWebViewScreen({super.key});

  @override
  State<SiteWebViewScreen> createState() => _SiteWebViewScreenState();
}

class _SiteWebViewScreenState extends State<SiteWebViewScreen> {
  WebViewController? _controller;
  double _loadProgress = 0;
  Object? _initError;

  @override
  void initState() {
    super.initState();
    unawaited(_initWebView());
  }

  PlatformWebViewControllerCreationParams _platformParams() {
    const PlatformWebViewControllerCreationParams defaults =
        PlatformWebViewControllerCreationParams();
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      return WebKitWebViewControllerCreationParams
          .fromPlatformWebViewControllerCreationParams(
        defaults,
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
        javaScriptCanOpenWindowsAutomatically: true,
      );
    }
    if (WebViewPlatform.instance is AndroidWebViewPlatform) {
      return AndroidWebViewControllerCreationParams
          .fromPlatformWebViewControllerCreationParams(defaults);
    }
    return defaults;
  }

  Future<void> _initWebView() async {
    try {
      final WebViewController controller = WebViewController.fromPlatformCreationParams(
        _platformParams(),
        onPermissionRequest: (WebViewPermissionRequest request) {
          request.grant();
        },
      );

      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setBackgroundColor(Colors.white);
      await controller.enableZoom(false);

      final Object platform = controller.platform;
      if (platform is AndroidWebViewController) {
        await platform.setGeolocationEnabled(true);
      }

      await controller.setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            if (!mounted) return;
            setState(() => _loadProgress = progress / 100.0);
          },
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() => _loadProgress = 0);
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() => _loadProgress = 1);
          },
        ),
      );

      await controller.loadRequest(Uri.parse(kAppSiteUrl));

      if (!mounted) return;
      setState(() {
        _controller = controller;
        _initError = null;
      });
    } catch (e, st) {
      debugPrint('WebView init failed: $e\n$st');
      if (!mounted) return;
      setState(() => _initError = e);
    }
  }

  Future<void> _handleSystemBack() async {
    final WebViewController? c = _controller;
    if (c == null) return;

    if (await c.canGoBack()) {
      await c.goBack();
      if (mounted) setState(() {});
      return;
    }

    if (!mounted) return;
    final bool? exit = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Text('Exit app?'),
          content: const Text(
            'You are on the first page in this session. '
            'Do you want to close the app?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Stay'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Exit'),
            ),
          ],
        );
      },
    );

    if (exit == true && mounted) {
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_initError != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48),
                const SizedBox(height: 16),
                Text(
                  'Could not start the browser view.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () {
                    setState(() {
                      _initError = null;
                      _controller = null;
                    });
                    unawaited(_initWebView());
                  },
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final WebViewController? c = _controller;
    if (c == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (didPop) return;
        unawaited(_handleSystemBack());
      },
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              if (_loadProgress < 1)
                LinearProgressIndicator(
                  minHeight: 3,
                  value: _loadProgress <= 0 ? null : _loadProgress,
                ),
              Expanded(child: WebViewWidget(controller: c)),
            ],
          ),
        ),
      ),
    );
  }
}
