import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../constants.dart';

/// Full-screen WebView with in-stack back navigation and exit confirmation
/// on the first history entry.
class MithobasaiWebScreen extends StatefulWidget {
  const MithobasaiWebScreen({super.key});

  @override
  State<MithobasaiWebScreen> createState() => _MithobasaiWebScreenState();
}

class _MithobasaiWebScreenState extends State<MithobasaiWebScreen> {
  late final WebViewController _controller;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    _controller = _createController();
    _prepareController();
  }

  WebViewController _createController() {
    late final PlatformWebViewControllerCreationParams params;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams
          .fromPlatformWebViewControllerCreationParams(
        const PlatformWebViewControllerCreationParams(),
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
        javaScriptCanOpenWindowsAutomatically: true,
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    final controller = WebViewController.fromPlatformCreationParams(
      params,
      onPermissionRequest: (WebViewPermissionRequest request) {
        request.grant();
      },
    );

    return controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() => _progress = progress);
          },
          onPageFinished: (_) {
            setState(() => _progress = 0);
            _applyNoZoomViewport();
          },
        ),
      );
  }

  Future<void> _prepareController() async {
    await _controller.enableZoom(false);
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      await platform.setMediaPlaybackRequiresUserGesture(false);
    }
    await _controller.loadRequest(Uri.parse(AppConstants.initialUrl));
  }

  /// Reinforces no pinch-zoom on pages that define their own viewport.
  Future<void> _applyNoZoomViewport() async {
    const script = '''
(function() {
  var content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
  var m = document.querySelector('meta[name="viewport"]');
  if (m) { m.setAttribute('content', content); }
  else {
    m = document.createElement('meta');
    m.setAttribute('name', 'viewport');
    m.setAttribute('content', content);
    (document.head || document.documentElement).appendChild(m);
  }
})();''';
    try {
      await _controller.runJavaScript(script);
    } catch (_) {
      // Page may not be ready; ignore.
    }
  }

  Future<void> _handleSystemBack() async {
    if (!mounted) return;
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return;
    }
    if (!mounted) return;
    final shouldExit = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Exit Mithobasai?'),
          content: const Text(
            'You are on the first page. Do you want to close the app?',
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
    if (shouldExit == true && mounted) {
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, dynamic result) {
        if (didPop) return;
        _handleSystemBack();
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Column(
            children: [
              if (_progress > 0 && _progress < 100)
                LinearProgressIndicator(
                  value: _progress / 100,
                  minHeight: 2,
                ),
              Expanded(child: WebViewWidget(controller: _controller)),
            ],
          ),
        ),
      ),
    );
  }
}
