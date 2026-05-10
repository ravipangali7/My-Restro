import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import 'mithobasai_web_screen.dart';
import 'no_internet_screen.dart';

/// Chooses between [MithobasaiWebScreen] and [NoInternetScreen] from connectivity.
class ConnectivityGate extends StatefulWidget {
  const ConnectivityGate({super.key});

  @override
  State<ConnectivityGate> createState() => _ConnectivityGateState();
}

class _ConnectivityGateState extends State<ConnectivityGate> {
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _online = true;

  static bool _isOnline(List<ConnectivityResult> results) {
    if (results.isEmpty) return false;
    return !results.contains(ConnectivityResult.none);
  }

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final initial = await _connectivity.checkConnectivity();
    if (mounted) {
      setState(() => _online = _isOnline(initial));
    }
    _subscription = _connectivity.onConnectivityChanged.listen((results) {
      if (mounted) {
        setState(() => _online = _isOnline(results));
      }
    });
  }

  Future<void> _retry() async {
    final results = await _connectivity.checkConnectivity();
    if (mounted) {
      setState(() => _online = _isOnline(results));
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_online) {
      return NoInternetScreen(onRetry: _retry);
    }
    return const MithobasaiWebScreen();
  }
}
