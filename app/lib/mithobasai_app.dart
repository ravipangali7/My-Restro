import 'package:flutter/material.dart';

import 'screens/connectivity_gate.dart';

/// Root widget: theme and home routing (online / offline).
class MithobasaiApp extends StatelessWidget {
  const MithobasaiApp({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF1565C0),
      brightness: Brightness.light,
    );
    return MaterialApp(
      title: 'Mithobasai',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: colorScheme,
        useMaterial3: true,
        appBarTheme: AppBarTheme(
          centerTitle: true,
          elevation: 0,
          scrolledUnderElevation: 1,
          backgroundColor: colorScheme.surface,
          foregroundColor: colorScheme.onSurface,
        ),
        dialogTheme: DialogThemeData(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      home: const ConnectivityGate(),
    );
  }
}
