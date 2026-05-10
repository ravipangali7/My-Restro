import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import 'screens/no_internet_screen.dart';
import 'screens/site_webview_screen.dart';

/// Chooses between [NoInternetScreen] and [SiteWebViewScreen] from connectivity.
class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _sub;
  bool _online = true;

  static bool _resultsOnline(List<ConnectivityResult> results) {
    if (results.isEmpty) return false;
    return !results.contains(ConnectivityResult.none);
  }

  @override
  void initState() {
    super.initState();
    unawaited(_refreshConnectivity());
    _sub = _connectivity.onConnectivityChanged.listen((List<ConnectivityResult> r) {
      final bool next = _resultsOnline(r);
      if (next != _online && mounted) {
        setState(() => _online = next);
      }
    });
  }

  Future<void> _refreshConnectivity() async {
    try {
      final List<ConnectivityResult> r = await _connectivity.checkConnectivity();
      final bool next = _resultsOnline(r);
      if (mounted) setState(() => _online = next);
    } catch (_) {
      if (mounted) setState(() => _online = true);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_online) {
      return NoInternetScreen(
        onRetry: () {
          unawaited(_refreshConnectivity());
        },
      );
    }
    return const SiteWebViewScreen();
  }
}
